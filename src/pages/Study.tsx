import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import BackButton from '../components/BackButton'
import CardDeck, { useStageScale, type Slot } from '../components/CardDeck'
import StudyHelp from '../components/StudyHelp'
import { useAudioPlayer } from '../lib/audio'
import { activeFilter, loadBooks, setActiveFilter } from '../lib/books'
import type { TagFilter } from '../lib/filter'
import { filterKey, poolOf } from '../lib/filter'
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
import { findWord, type Word } from '../data/words'
import { enterRound, markCentered, markChecked } from '../lib/stats'
import { addPending, takePending } from '../lib/pending'
import { flushAll, markProgressDirty } from '../lib/sync'
import { copyText } from '../lib/clipboard'
import { useWheelFlip } from '../lib/wheel'
import { useDoubleRightClick } from '../lib/rightclick'
import { ensureSession, logEvent } from '../lib/analytics'
import { logicalDay } from '../lib/day'
import { armQuiz, loadQuiz } from '../lib/quiz'
import { useExitLifecycle, usePreloadWords, useWordDetails } from '../lib/session'

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
    const f = activeFilter(loadBooks()) ?? { include: [], exclude: [] }
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
    enterRound(`${init.fk}#${init.cascade.r}`)
    if (init.filter) setActiveFilter(init.filter)
    // 只在挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // 下一轮时递增，给舞台换 key → 重放进入 Study 页的入场动画
  const [roundTick, setRoundTick] = useState(0)

  // A1 等比缩放（舞台 1200×360）+ 底部提示行测量
  const { appRef, hintsRef, scale } = useStageScale()

  const deckKey = useMemo(() => deck.join('.'), [deck])
  const TOTAL = deck.length

  const [center, setCenter] = useState(() =>
    TOTAL ? Math.min(loadCenter(fk, deckKey), TOTAL - 1) : 0,
  )

  useEffect(() => {
    saveCenter(fk, deckKey, center)
  }, [fk, deckKey, center])

  const centerName: string | null = deck.length ? deck[center] : null
  const centerWord: Word | null = centerName
    ? (findWord(centerName) ?? null)
    : null

  // 中心卡变化 → 记「碰到」（按回合去重）+ 加入该书 quiz 待考池
  useEffect(() => {
    if (quizArmed) return // 只是被重定向到 quiz，没真的看
    if (centerName) {
      markCentered(centerName)
      addPending(fk, centerName)
      markProgressDirty()
    }
  }, [centerName, quizArmed, fk])

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
    dayRef.current = today
    setRevealCounts({})
    return true
  }, [])

  // —— 埋点计时 ——
  const enteredRef = useRef(false)
  /** 当前这张卡是否已进入（离卡时补一条 card 事件） */
  const cardActiveRef = useRef(false)
  /** 当前这张卡的进入方向（合并进 card 事件） */
  const dirRef = useRef<'init' | 'left' | 'right'>('init')
  /** 当前这张卡展开过几次（合并进 card 事件） */
  const visitRevealsRef = useRef(0)
  const roundIndexRef = useRef(1)
  const leaveFnRef = useRef<() => void>(() => {})
  const exitSentRef = useRef(false)

  // 中间卡片是否展示音标 + 释义
  const [revealed, setRevealed] = useState(false)

  // 操作帮助弹窗（底部提示行最左侧「? 帮助」或按 ? 键）
  const [helpOpen, setHelpOpen] = useState(false)

  // Ctrl/Cmd+C 或右键中心卡复制当前词后，用「已复制」顶替词语 1s（只淡入，无淡出）
  const [copyNotice, setCopyNotice] = useState<string | null>(null)
  const copyTimerRef = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(copyTimerRef.current), [])
  const clearCopy = useCallback(() => {
    window.clearTimeout(copyTimerRef.current)
    setCopyNotice(null)
  }, [])

  // 进入一张卡
  const beginCard = useCallback((dir: 'init' | 'left' | 'right') => {
    cardActiveRef.current = true
    dirRef.current = dir
    visitRevealsRef.current = 0
  }, [])

  // 离开当前中心卡：记一条 card（进卡/离卡合并）
  const emitCardLeave = useCallback(() => {
    if (!centerName || !cardActiveRef.current) return
    logEvent('study_card', {
      word: centerName,
      dir: dirRef.current,
      reveals: visitRevealsRef.current,
    })
    cardActiveRef.current = false
    visitRevealsRef.current = 0
  }, [centerName])
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
    ensureSession()
    logEvent('study_enter', { filterKey: fk })
    logEvent('study_round', { index: roundIndexRef.current, words: deck })
    if (centerName) beginCard('init')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 切窗口/切标签：away 状态变化时记一条（用于统计学习时长）
  useEffect(() => {
    let wasAway = !document.hasFocus() || document.hidden
    const syncAway = (by: 'visibility' | 'focus') => {
      const awayNow = !document.hasFocus() || document.hidden
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
  }, [])

  // 关页补最后一张卡 + exit；真正卸载时补 back（共用 useExitLifecycle）
  useExitLifecycle({
    onPageHide: () => {
      leaveFnRef.current() // 补最后一张卡（card 在离卡时才写）
      void flushAll() // 把进度/统计推上去（尽量）
      emitExit('unload')
    },
    onUnmount: () => {
      if (!hasRound || quizArmed) return // 没真正进入过（重定向中），没有可收尾的
      leaveFnRef.current()
      emitExit('back')
    },
  })

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

  // 滚轮翻卡
  useWheelFlip(go)

  // 音频：按需播放（同一时刻只播一个），并预加载这一轮，首次不延迟
  const detailsReady = useWordDetails()
  const play = useAudioPlayer()

  usePreloadWords(deck, detailsReady)

  // 首次：显示释义 + 朗读；已显示：只重播
  const reveal = useCallback(() => {
    ensureDay()
    setRevealed(true)
    if (centerName) {
      setRevealCounts((c) => ({ ...c, [centerName]: (c[centerName] || 0) + 1 }))
      visitRevealsRef.current += 1
      markChecked(centerName)
    }
    play(centerWord?.audio)
  }, [play, centerWord, centerName, ensureDay])

  const toggleReveal = useCallback(() => {
    if (revealed) play(centerWord?.audio)
    else reveal()
  }, [revealed, play, reveal, centerWord])

  // 复制当前中心词到剪贴板（Ctrl/Cmd+C 或右键中心卡）
  const copyCurrent = useCallback(() => {
    if (!centerName) return
    void copyText(centerName).then((ok) => {
      if (!ok) return
      window.clearTimeout(copyTimerRef.current)
      setCopyNotice('已复制')
      copyTimerRef.current = window.setTimeout(() => setCopyNotice(null), 1000)
    })
  }, [centerName])

  // 下一轮：到 quiz 边界先插 quiz；否则级联前进一轮（必要时按周期刷新各级）
  const nextRound = useCallback(() => {
    if (book.length === 0) return
    const c = cascadeRef.current
    // 学完 WINDOW_ROUNDS 轮、活跃窗口将换新 → 插入 quiz（不 advance，交给 quiz 结束后推进）
    if (c.r > 0 && c.r % WINDOW_ROUNDS === 0) {
      const cands = takePending(fk)
      if (cands.length > 0) {
        emitCardLeave()
        armQuiz(fk, cands, c.r)
        logEvent('study_to_quiz', { batch: c.r })
        void flushAll()
        emitExit('quiz')
        navigate('/quiz')
        return
      }
      // 没 center 过任何词（待考池空）：不插 quiz，正常进入下一轮
    }
    const next = advance(c, book)
    cascadeRef.current = next
    saveCascade(fk, next)
    enterRound(`${fk}#${next.r}`)
    emitCardLeave()
    void flushAll() // 每轮结束：推进度 + 统计
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

      // ?：打开 / 关闭帮助；打开时其它快捷键交给弹窗（Esc 由 Modal 关闭）
      if (k === '?') {
        e.preventDefault()
        if (e.repeat) return
        setHelpOpen((v) => !v)
        return
      }
      if (helpOpen) return

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
  }, [go, toggleReveal, nextRound, copyCurrent, helpOpen])

  // 双击右键（触控板双指点两次）= 下一轮；中心卡除外（那里单击=复制）
  useDoubleRightClick(nextRound, {
    ignore: (target) => !!target?.closest('.card.active'),
  })

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

  // 详情（音标/释义/音频）就绪前不渲染卡片
  if (!detailsReady) return null

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
        onCardContextMenu={copyCurrent}
      />

      <div className="hints" ref={hintsRef}>
        <button
          type="button"
          className="hint-btn"
          onClick={(e) => {
            e.currentTarget.blur()
            setHelpOpen(true)
          }}
        >
          <kbd>?</kbd> 帮助
        </button>
        <span>
          <kbd>Space</kbd> {revealed ? '重新播放' : '显示释义'}
        </span>
        <span>
          <kbd>Enter</kbd> 下一轮
        </span>
      </div>

      {helpOpen && <StudyHelp onClose={() => setHelpOpen(false)} />}
    </div>
  )
}
