import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import BackButton from '../components/BackButton'
import CardDeck, { useStageScale, type Slot } from '../components/CardDeck'
import type { Word } from '../data/words'
import { preloadAudio, useAudioPlayer } from '../lib/audio'
import { loadBooks } from '../lib/books'
import type { TagFilter } from '../lib/filter'
import { filterKey, loadFilter, poolOf, saveFilter } from '../lib/filter'
import {
  loadCenter,
  loadRevealStore,
  saveCenter,
  saveRevealStore,
} from '../lib/progress'
import type { Cascade } from '../lib/cascade'
import {
  advance,
  ensureCascade,
  loadCascade,
  saveCascade,
  WINDOW_ROUNDS,
} from '../lib/cascade'
import { getWord } from '../lib/dict'
import { copyText } from '../lib/clipboard'
import { ensureSession, flushBeacon, logEvent } from '../lib/analytics'
import { logicalDay } from '../lib/day'
import { armQuiz, loadQuiz } from '../lib/quiz'

// 切窗口/失焦：短于此时长（ms）的忽略，避免点地址栏/通知误判为离开
const AWAY_MIN_MS = 1000

/** Study 挂载时的初始状态（只算一次） */
type StudyInit = {
  fk: string
  /** 当前词池 */
  book: string[]
  /** 当前词书的级联状态（cascade.round 就是这一轮） */
  cascade: Cascade
  /** 自动进入某本词书时需要落盘的筛选（续上次时为 null） */
  filter: TagFilter | null
  /** 一本词书都没有：回主页并弹出 TagPicker */
  needPick: boolean
}

/**
 * 学习页：只负责「翻」。
 * 牌组就是词书弹窗里那一轮（默认 ROUND_SIZE 个词），环形滑动，Space 展开，Enter 下一轮。
 * 每学完 WINDOW_ROUNDS 轮（活跃窗口换新前）插入一次 Quiz（见 lib/quiz.ts）。
 */
export default function Study() {
  const navigate = useNavigate()

  // 初始状态只算一次（StrictMode 下 render 会跑两遍，避免洗出两轮不同的牌）。
  // 一轮来自「级联窗口」（见 lib/cascade.ts、docs/sampling.md）：
  //  1) 续上次：当前筛选存过级联，且校准后仍有词 → 继续
  //  2) 否则有词书：进「最新创建」且有词的那本，直接开一轮（等价于点「开始学习」）
  //  3) 一本词书都没有 → 回主页并弹 TagPicker
  const initRef = useRef<StudyInit | null>(null)
  if (!initRef.current) {
    const f = loadFilter()
    const fk = filterKey(f)
    const book = poolOf(f)

    // 1) 续上次
    if (loadCascade(fk)) {
      const c = ensureCascade(fk, book)
      if (c.round.length > 0) {
        initRef.current = { fk, book, cascade: c, filter: null, needPick: false }
      }
    }
    // 2) 否则有词书：进「最新创建」且有词的那本
    if (!initRef.current) {
      const books = loadBooks()
      const next = [...books]
        .sort((a, b) => b.id - a.id)
        .map((b) => ({
          filter: b.filter,
          key: filterKey(b.filter),
          pool: poolOf(b.filter),
        }))
        .find((b) => b.pool.length > 0)
      if (next) {
        initRef.current = {
          fk: next.key,
          book: next.pool,
          cascade: ensureCascade(next.key, next.pool),
          filter: next.filter,
          needPick: false,
        }
      } else {
        initRef.current = {
          fk,
          book,
          cascade: { r: 0, levels: [], round: [] },
          filter: null,
          needPick: books.length === 0,
        }
      }
    }
  }
  const init = initRef.current!
  const { fk, book, needPick } = init
  const cascadeRef = useRef(init.cascade)
  const round = init.cascade.round
  const hasRound = round.length > 0

  // 已到 quiz 边界（Quiz 已 arm）时，/study 一律重定向到 /quiz
  const quizArmed = useMemo(() => loadQuiz() !== null, [])

  const [deck, setDeck] = useState(round)

  // 级联状态 / 自动进入时的筛选落盘，刷新后一致
  useEffect(() => {
    if (init.cascade.round.length === 0) return
    saveCascade(init.fk, init.cascade)
    if (init.filter) saveFilter(init.filter)
    // 只在挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // 下一轮时递增，给舞台换 key → 重放进入 Study 页的入场动画
  const [roundTick, setRoundTick] = useState(0)

  // A1 等比缩放（舞台 1200×360）+ 底部提示行测量
  const { appRef, hintsRef, scale } = useStageScale()

  const centerKey = useMemo(() => `${fk}|${deck.join('.')}`, [fk, deck])
  const TOTAL = deck.length

  const [center, setCenter] = useState(() =>
    TOTAL ? Math.min(loadCenter(centerKey), TOTAL - 1) : 0,
  )

  useEffect(() => {
    saveCenter(centerKey, center)
  }, [centerKey, center])

  const centerName: string | null = deck.length ? deck[center] : null
  const centerWord: Word | null = centerName
    ? (getWord(centerName) ?? null)
    : null

  // 展开次数：按逻辑日（本地 04:00 换日）分桶。加载时若已跨天，loadRevealStore 返回清空后的 store
  const initialReveal = useRef<ReturnType<typeof loadRevealStore> | null>(null)
  if (!initialReveal.current) initialReveal.current = loadRevealStore()
  const revealInit = initialReveal.current!
  const [revealCounts, setRevealCounts] = useState<Record<string, number>>(
    revealInit.store.counts,
  )
  const dayRef = useRef(revealInit.store.day)

  useEffect(() => {
    saveRevealStore({ day: dayRef.current, counts: revealCounts })
  }, [revealCounts])

  // 跨天（04:00）时清零；在每次展开前调用。返回是否真的清零了
  const ensureDay = useCallback((): boolean => {
    const today = logicalDay()
    if (dayRef.current === today) return false
    const from = dayRef.current
    dayRef.current = today
    setRevealCounts({})
    logEvent('counts_reset', { from, to: today })
    return true
  }, [])

  // —— 埋点计时 ——
  const enteredRef = useRef(false)
  const aliveRef = useRef(true)
  const viewStartRef = useRef(0)
  const firstRevealRef = useRef<number | null>(null)
  /** 当前这张卡的进入方向（合并进 card 事件） */
  const dirRef = useRef<'init' | 'left' | 'right'>('init')
  /** 当前这张卡展开过几次（合并进 card 事件） */
  const visitRevealsRef = useRef(0)
  const roundIndexRef = useRef(1)
  const leaveFnRef = useRef<() => void>(() => {})
  const exitSentRef = useRef(false)
  // 切窗口计时：awayAtRef = 本次离开开始时刻；before/after 分别累计两个阶段的离开时长
  const awayAtRef = useRef<number | null>(null)
  const awayBeforeRef = useRef(0)
  const awayAfterRef = useRef(0)

  // 中间卡片是否展示音标 + 释义
  const [revealed, setRevealed] = useState(false)

  // Ctrl/Cmd+C 复制当前词后，用「已复制」顶替词语 1s（只淡入，无淡出）
  const [copyNotice, setCopyNotice] = useState<string | null>(null)
  const copyTimerRef = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(copyTimerRef.current), [])
  const clearCopy = useCallback(() => {
    window.clearTimeout(copyTimerRef.current)
    setCopyNotice(null)
  }, [])

  // 结算一段「离开」：按是否已展开，累加到对应阶段（忽略 <1s 的短暂失焦）
  const closeAway = useCallback((now: number) => {
    const start = awayAtRef.current
    if (start === null) return
    awayAtRef.current = null
    const gap = now - start
    if (gap < AWAY_MIN_MS) return
    if (firstRevealRef.current === null) awayBeforeRef.current += gap
    else awayAfterRef.current += gap
  }, [])

  // 进入一张卡：重置计时与离开累计（card 事件在离卡时统一记）
  const beginCard = useCallback((dir: 'init' | 'left' | 'right') => {
    viewStartRef.current = performance.now()
    firstRevealRef.current = null
    dirRef.current = dir
    visitRevealsRef.current = 0
    awayBeforeRef.current = 0
    awayAfterRef.current = 0
    awayAtRef.current =
      !document.hasFocus() || document.hidden ? performance.now() : null
  }, [])

  // 离开当前中心卡：记一条 card（进卡/离卡合并；停留已扣除切窗口时间）
  const emitCardLeave = useCallback(() => {
    if (!centerName || viewStartRef.current === 0) return
    const now = performance.now()
    closeAway(now)
    const rawBefore =
      firstRevealRef.current !== null
        ? firstRevealRef.current - viewStartRef.current
        : now - viewStartRef.current
    const rawAfter =
      firstRevealRef.current !== null ? now - firstRevealRef.current : 0
    logEvent('study_card', {
      word: centerName,
      dir: dirRef.current,
      dwellBeforeMs: Math.max(0, Math.round(rawBefore - awayBeforeRef.current)),
      dwellAfterMs: Math.max(0, Math.round(rawAfter - awayAfterRef.current)),
      reveals: visitRevealsRef.current,
    })
    viewStartRef.current = 0
    firstRevealRef.current = null
    visitRevealsRef.current = 0
    awayBeforeRef.current = 0
    awayAfterRef.current = 0
    awayAtRef.current = null
  }, [centerName, closeAway])
  leaveFnRef.current = emitCardLeave

  // 会话结束：一次只发一条
  const emitExit = useCallback((reason: 'back' | 'unload' | 'quiz') => {
    if (exitSentRef.current) return
    exitSentRef.current = true
    logEvent('study_exit', { reason })
  }, [])

  // 进入学习：开始会话，记 study_enter / 首组 / 首张（StrictMode 下只执行一次）
  useEffect(() => {
    if (!hasRound) return // 没有有效的一轮：马上重定向，不记这次学习
    if (quizArmed) return // 已被重定向到 quiz，不算一次学习
    if (enteredRef.current) return
    enteredRef.current = true
    if (revealInit.previousDay) {
      logEvent('counts_reset', {
        from: revealInit.previousDay,
        to: revealInit.store.day,
      })
    }
    ensureSession()
    logEvent('study_enter', { filterKey: fk })
    logEvent('study_round', { index: roundIndexRef.current, words: deck })
    if (centerName) beginCard('init')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 切窗口/切标签：结算「离开」时长（hidden 或 blur），away 状态变化时记一条
  useEffect(() => {
    let wasAway = !document.hasFocus() || document.hidden
    const syncAway = (by: 'visibility' | 'focus') => {
      const awayNow = !document.hasFocus() || document.hidden
      const now = performance.now()
      if (awayNow) {
        if (awayAtRef.current === null) awayAtRef.current = now
      } else {
        closeAway(now)
      }
      if (awayNow !== wasAway) {
        wasAway = awayNow
        logEvent('study_away', { away: awayNow, by })
      }
    }
    const onVis = () => syncAway('visibility')
    const onFocus = () => syncAway('focus')
    const onBlur = () => syncAway('focus')
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
    }
  }, [closeAway])

  // 页面卸载（关标签/刷新/外跳）：尽力补一条 study_exit 并立即发出
  useEffect(() => {
    const onPageHide = () => {
      leaveFnRef.current() // 补最后一张卡（card 在离卡时才写）
      emitExit('unload')
      flushBeacon()
    }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [emitExit])

  // 真正离开 Study 页时补最后一张的 card + study_exit（微任务区分 StrictMode 的假卸载）
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      if (!hasRound || quizArmed) return // 没真正进入过（重定向中），没有可收尾的
      queueMicrotask(() => {
        if (!aliveRef.current) {
          leaveFnRef.current()
          emitExit('back')
        }
      })
    }
  }, [emitExit, hasRound, quizArmed])

  // 翻页
  const go = useCallback(
    (delta: number) => {
      if (TOTAL === 0) return
      emitCardLeave()
      const next = (center + delta + TOTAL) % TOTAL
      beginCard(delta > 0 ? 'right' : 'left')
      setRevealed(false)
      clearCopy()
      setCenter(next)
    },
    [TOTAL, center, emitCardLeave, beginCard, clearCopy],
  )

  // 音频：按需播放（同一时刻只播一个），并预加载这一轮，首次不延迟
  const play = useAudioPlayer()

  useEffect(() => {
    preloadAudio(
      deck.flatMap((name) => {
        const w = getWord(name)
        return w ? [w.audio_file] : []
      }),
    )
  }, [deck])

  // 首次：显示释义 + 朗读；已显示：只重播
  const reveal = useCallback(() => {
    ensureDay()
    setRevealed(true)
    if (centerName) {
      setRevealCounts((c) => ({ ...c, [centerName]: (c[centerName] || 0) + 1 }))
      visitRevealsRef.current += 1
      if (firstRevealRef.current === null) {
        firstRevealRef.current = performance.now()
      }
    }
    play(centerWord?.audio_file)
  }, [play, centerWord, centerName, ensureDay])

  const toggleReveal = useCallback(() => {
    if (revealed) play(centerWord?.audio_file)
    else reveal()
  }, [revealed, play, reveal, centerWord])

  // 复制当前中心词到剪贴板（Ctrl/Cmd+C）
  const copyCurrent = useCallback(() => {
    if (!centerName) return
    void copyText(centerName).then((ok) => {
      if (!ok) return
      logEvent('study_copy', { word: centerName, revealed })
      window.clearTimeout(copyTimerRef.current)
      setCopyNotice('已复制')
      copyTimerRef.current = window.setTimeout(() => setCopyNotice(null), 1000)
    })
  }, [centerName, revealed])

  // 下一轮：到 quiz 边界先插 quiz；否则级联前进一轮（必要时按周期刷新各级）
  const nextRound = useCallback(() => {
    if (book.length === 0) return
    const c = cascadeRef.current
    // 学完 WINDOW_ROUNDS 轮、活跃窗口将换新 → 插入 quiz（不 advance，交给 quiz 结束后推进）
    if (c.r > 0 && c.r % WINDOW_ROUNDS === 0) {
      emitCardLeave()
      armQuiz(fk, loadFilter(), c.levels[0] ?? book, c.r)
      logEvent('study_to_quiz', { batch: c.r })
      emitExit('quiz')
      navigate('/quiz')
      return
    }
    const next = advance(c, book)
    cascadeRef.current = next
    saveCascade(fk, next)
    emitCardLeave()
    roundIndexRef.current += 1
    logEvent('study_round', { index: roundIndexRef.current, words: next.round })
    if (next.round[0]) beginCard('init')
    setRevealed(false)
    clearCopy()
    setDeck(next.round)
    setCenter(0)
    setRoundTick((t) => t + 1)
  }, [book, fk, emitCardLeave, emitExit, beginCard, navigate, clearCopy])

  // 键盘：Space 释义 / Enter 下一轮 / H L 翻页
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = e.key

      // Ctrl/Cmd+C：复制当前词（页面不可选中，接管原生复制）
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && k.toLowerCase() === 'c') {
        e.preventDefault()
        if (e.repeat) return
        copyCurrent()
        return
      }
      if (k === ' ') {
        e.preventDefault() // 防止页面滚动
        if (e.repeat) return // 按住时忽略自动重复，避免疯狂重播
        toggleReveal()
        return
      }
      if (k === 'Enter') {
        e.preventDefault() // 防止顺手触发聚焦的按钮
        if (e.repeat) return // 按住时只换一次
        nextRound()
        return
      }
      const low = k.toLowerCase()
      if (low === 'h' || k === 'ArrowLeft') {
        e.preventDefault()
        go(-1)
      } else if (low === 'l' || k === 'ArrowRight') {
        e.preventDefault()
        go(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, toggleReveal, nextRound, copyCurrent])

  // 已到 quiz 边界（Study 已 arm）：一律去 /quiz
  if (quizArmed) return <Navigate to="/quiz" replace />

  // 没有有效的一轮 → 回主页重新选词书（用 <Navigate>，不先闪一下整池）
  if (!hasRound)
    return (
      <Navigate
        to="/"
        replace
        state={needPick ? { openPicker: true } : undefined}
      />
    )

  const onCardClick = (_name: string, slot: Slot) => {
    if (slot === 0) toggleReveal()
    else if (slot === 1 || slot === 'S') go(1)
    else if (slot === -1) go(-1)
  }

  return (
    <div className="app" ref={appRef}>
      <BackButton to="/" label="返回主页" />
      {/* 右下角：下一轮（与左上角返回键镜像对称） */}
      <button
        type="button"
        className="icon-btn next-round-btn"
        onClick={nextRound}
        aria-label="下一轮"
        title="下一轮"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </button>

      <CardDeck
        deck={deck}
        center={center}
        revealed={revealed}
        centerNotice={copyNotice}
        revealCounts={revealCounts}
        scale={scale}
        stageKey={roundTick}
        onCardClick={onCardClick}
      />

      <div className="hints" ref={hintsRef}>
        <span>
          <kbd>Space</kbd> {revealed ? '重新播放' : '显示释义'}
        </span>
        <span>
          <kbd>Enter</kbd> 下一轮
        </span>
      </div>
    </div>
  )
}
