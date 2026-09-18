import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../components/BackButton'
import type { Word } from '../data/words'
import { words } from '../data/words'
import { preloadAudio, useAudioPlayer } from '../lib/audio'
import { filterKey, loadFilter, matchesFilter } from '../lib/filter'
import { loadCenter, loadRevealStore, saveCenter, saveRevealStore } from '../lib/progress'
import { loadSession, saveSession } from '../lib/session'
import { drawRound, saveOrder } from '../lib/rounds'
import { getWord } from '../lib/dict'
import { beginSession, flushBeacon, logEvent } from '../lib/analytics'
import { logicalDay } from '../lib/day'
import { tagLabel, tagRank } from '../lib/tags'

/** 圆点的颜色：r 红 / y 黄 / g 绿 / empty 空位灰 */
type DotColor = 'r' | 'y' | 'g' | 'empty'

// 「展开释义」次数 → 3 个实心圆：
//   1~3 次：1/2/3 绿；4~6 次：1/2/3 黄；7~9 次：1/2/3 红
//   9 次以后照常计数，但显示停在 3 个红
const DOT_TIERS: DotColor[] = ['g', 'y', 'r']
function dotColors(n: number): DotColor[] {
  if (n <= 0) return ['empty', 'empty', 'empty']
  const tier = Math.min(Math.floor((n - 1) / 3), DOT_TIERS.length - 1)
  const filled = n >= 9 ? 3 : ((n - 1) % 3) + 1
  return Array.from({ length: 3 }, (_, i) =>
    i < filled ? DOT_TIERS[tier] : 'empty',
  )
}

// 每侧渲染 2 张：±1 可见，±2 是屏外过渡位（保证环形无缝）
const SIDE = 2

// 舞台的设计尺寸（A1 等比缩放的基准，与 index.css 的 .cards 保持一致）
const STAGE_W = 1200
const STAGE_H = 360

// 切窗口/失焦：短于此时长（ms）的忽略，避免点地址栏/通知误判为离开
const AWAY_MIN_MS = 1000

/** 卡片槽位：数字为环形位置，'B' 偶数张的正背面，'S' 只剩两张时的右侧位 */
type Slot = number | 'B' | 'S'

// 计算某个卡片（deck 里的位置）相对当前中心的位置：
// 0 居中，±1 可见，±2 屏外过渡位；偶数张时正背面用 'B'（藏在中间背后）
function slotOf(p: number, center: number, n: number): Slot {
  let d = (p - center) % n
  if (d < 0) d += n
  // 只剩两张：另一张露出 3/5
  if (n === 2) return d === 0 ? 0 : 'S'
  if (n % 2 === 0 && d === n / 2) return 'B'
  if (d > n / 2) d -= n
  return d
}

/**
 * 学习页：只负责「翻」。
 * 牌组就是词书弹窗里那一轮（默认 20 个词），环形滑动，Space 展开，Enter 换一轮。
 */
export default function Study() {
  const navigate = useNavigate()

  // 词书筛选 + 这一轮的词（session，word 字符串）；换一轮会替换 deck
  const { fk, book, initialDeck } = useMemo(() => {
    const f = loadFilter()
    const fk = filterKey(f)
    const book = words.filter((w) => matchesFilter(w, f)).map((w) => w.word)
    const s = loadSession()
    if (s && s.key === fk) {
      const has = new Set(book)
      const list = s.words.filter((w) => has.has(w))
      if (list.length > 0) return { fk, book, initialDeck: list }
    }
    return { fk, book, initialDeck: book }
  }, [])

  const [deck, setDeck] = useState(initialDeck)
  // 换一轮时递增，给舞台换 key → 重放进入 Study 页的入场动画（.cards 的 app-in）
  const [roundTick, setRoundTick] = useState(0)

  // A1 等比缩放：舞台内部保持 1200×360 设计尺寸，按「视口 - 留白 - 提示行」算缩放比（≤1）
  const appRef = useRef<HTMLDivElement>(null)
  const hintsRef = useRef<HTMLDivElement>(null)
  const [stageScale, setStageScale] = useState(() => {
    const availW = document.documentElement.clientWidth - 48
    const availH = document.documentElement.clientHeight - 48 - 32 - 30
    return Math.max(0.2, Math.min(1, availW / STAGE_W, availH / STAGE_H))
  })

  useEffect(() => {
    const app = appRef.current
    if (!app) return
    const update = () => {
      // 留白/间距从计算样式读，随矮视口媒体查询自动变
      const cs = getComputedStyle(app)
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
      const gap = parseFloat(cs.rowGap) || 0
      const hintsH = hintsRef.current?.getBoundingClientRect().height ?? 0
      // 用 documentElement（不含滚动条）而不是 window.innerWidth，避免高估可用宽
      const availW = document.documentElement.clientWidth - padX
      const availH =
        document.documentElement.clientHeight - padY - gap - hintsH
      setStageScale(
        Math.max(0.2, Math.min(1, availW / STAGE_W, availH / STAGE_H)),
      )
    }
    update()
    const ro = new ResizeObserver(update)
    if (hintsRef.current) ro.observe(hintsRef.current)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])
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
  const roundIndexRef = useRef(1)
  const leaveFnRef = useRef<() => void>(() => {})
  const exitSentRef = useRef(false)
  // 切窗口计时：awayAtRef = 本次离开开始时刻；before/after 分别累计两个阶段的离开时长
  const awayAtRef = useRef<number | null>(null)
  const awayBeforeRef = useRef(0)
  const awayAfterRef = useRef(0)

  // 中间卡片是否展示音标 + 释义
  const [revealed, setRevealed] = useState(false)

  // 悬浮光晕：按「指针位置」命中，而不是 CSS :hover。
  // 否则卡片位移后，:hover 会粘在移动的那个元素上（光晕跟着卡片而不是鼠标）。
  const [hoveredName, setHoveredName] = useState<string | null>(null)
  const pointer = useRef<{ x: number; y: number } | null>(null)

  const updateHover = useCallback(() => {
    const pt = pointer.current
    if (!pt) return
    const el = document.elementFromPoint(pt.x, pt.y)
    const cardEl = el?.closest<HTMLElement>('.card[data-word]')
    setHoveredName(cardEl?.dataset.word ?? null)
  }, [])

  const onCardsMouseMove = useCallback(
    (e: ReactMouseEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY }
      updateHover()
    },
    [updateHover],
  )

  const onCardsMouseLeave = useCallback(() => {
    pointer.current = null
    setHoveredName(null)
  }, [])

  // 翻页动画期间持续按指针位置重新命中，让光晕跟着「位置」走
  useEffect(() => {
    if (!pointer.current) return
    let raf = 0
    const start = performance.now()
    const tick = () => {
      updateHover()
      if (performance.now() - start < 520) {
        raf = requestAnimationFrame(tick)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [center, deck, updateHover])

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

  // 进入一张卡：重置计时与离开累计
  const beginCard = useCallback(
    (name: string, dir: 'init' | 'left' | 'right') => {
      viewStartRef.current = performance.now()
      firstRevealRef.current = null
      awayBeforeRef.current = 0
      awayAfterRef.current = 0
      awayAtRef.current =
        !document.hasFocus() || document.hidden ? performance.now() : null
      logEvent('card_view', { word: name, dir, n: revealCounts[name] || 0 })
    },
    [revealCounts],
  )

  // 离开当前中心卡：补一条 card_leave（前/后停留，已扣除切窗口时间）
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
    logEvent('card_leave', {
      word: centerName,
      dwellBeforeMs: Math.max(0, Math.round(rawBefore - awayBeforeRef.current)),
      dwellAfterMs: Math.max(0, Math.round(rawAfter - awayAfterRef.current)),
    })
    viewStartRef.current = 0
    firstRevealRef.current = null
    awayBeforeRef.current = 0
    awayAfterRef.current = 0
    awayAtRef.current = null
  }, [centerName, closeAway])
  leaveFnRef.current = emitCardLeave

  // 会话结束：一次只发一条
  const emitExit = useCallback((reason: 'back' | 'unload') => {
    if (exitSentRef.current) return
    exitSentRef.current = true
    logEvent('study_exit', { reason })
  }, [])

  // 进入学习：开始会话，记 study_enter / 首组 / 首张（StrictMode 下只执行一次）
  useEffect(() => {
    if (enteredRef.current) return
    enteredRef.current = true
    if (revealInit.previousDay) {
      logEvent('counts_reset', {
        from: revealInit.previousDay,
        to: revealInit.store.day,
      })
    }
    beginSession()
    logEvent('study_enter', { filterKey: fk, deckSize: TOTAL })
    logEvent('round_new', { index: roundIndexRef.current, words: deck })
    if (centerName) beginCard(centerName, 'init')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 切窗口/切标签：记录可见性与焦点，并结算「离开」时长（hidden 或 blur）
  useEffect(() => {
    const syncAway = () => {
      const awayNow = !document.hasFocus() || document.hidden
      const now = performance.now()
      if (awayNow) {
        if (awayAtRef.current === null) awayAtRef.current = now
      } else {
        closeAway(now)
      }
    }
    const onVis = () => {
      logEvent('visibility', { state: document.visibilityState })
      syncAway()
    }
    const onFocus = () => {
      logEvent('focus', { state: 'focus' })
      syncAway()
    }
    const onBlur = () => {
      logEvent('focus', { state: 'blur' })
      syncAway()
    }
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
      emitExit('unload')
      flushBeacon()
    }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [emitExit])

  // 真正离开 Study 页时补最后一张的 card_leave + study_exit（微任务区分 StrictMode 的假卸载）
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      queueMicrotask(() => {
        if (!aliveRef.current) {
          leaveFnRef.current()
          emitExit('back')
        }
      })
    }
  }, [emitExit])

  // 翻页
  const go = useCallback(
    (delta: number) => {
      if (TOTAL === 0) return
      emitCardLeave()
      const next = (center + delta + TOTAL) % TOTAL
      const name = deck[next]
      if (name) beginCard(name, delta > 0 ? 'right' : 'left')
      setRevealed(false)
      setCenter(next)
    },
    [TOTAL, center, deck, emitCardLeave, beginCard],
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
    const didReset = ensureDay()
    setRevealed(true)
    if (centerName) {
      const n = (didReset ? 0 : revealCounts[centerName] || 0) + 1
      setRevealCounts((c) => ({ ...c, [centerName]: (c[centerName] || 0) + 1 }))
      if (firstRevealRef.current === null) {
        firstRevealRef.current = performance.now()
      }
      logEvent('reveal', { word: centerName, n })
    }
    play(centerWord?.audio_file)
  }, [play, centerWord, centerName, ensureDay, revealCounts])

  const toggleReveal = useCallback(() => {
    if (revealed) play(centerWord?.audio_file)
    else reveal()
  }, [revealed, play, reveal, centerWord])

  // 换一轮：洗整本词书，取前 ROUND_SIZE 个作为新的一轮，并持久化
  const nextRound = useCallback(() => {
    if (book.length === 0) return
    const { order, round } = drawRound(book)
    saveOrder(fk, order)
    saveSession({ key: fk, words: round })
    emitCardLeave()
    roundIndexRef.current += 1
    logEvent('round_new', { index: roundIndexRef.current, words: round })
    if (round[0]) beginCard(round[0], 'init')
    setRevealed(false)
    setHoveredName(null)
    setDeck(round)
    setCenter(0)
    setRoundTick((t) => t + 1)
  }, [book, fk, emitCardLeave, beginCard])

  // 键盘：Space 释义 / Enter 换一轮 / H L 翻页
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = e.key

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
  }, [go, toggleReveal, nextRound])

  if (TOTAL === 0) {
    return (
      <div className="app">
        <BackButton to="/" label="返回主页" />
        <div className="empty-study">
          <p>还没有可学的词</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/')}
          >
            去选词书
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="app" ref={appRef}>
      <BackButton to="/" label="返回主页" />
      <div
        className="stage"
        key={roundTick}
        style={{ '--stage-scale': stageScale } as CSSProperties}
      >
        <div
          className="cards"
          onMouseMove={onCardsMouseMove}
          onMouseLeave={onCardsMouseLeave}
        >
          {/* 固定按词序渲染，DOM 顺序稳定，翻页只改 transform → 平滑环形滑动 */}
          {deck.map((name, p) => {
            const slot = slotOf(p, center, deck.length)
            // 数字槽位超出窗口就不渲染；'B' / 'S' 始终渲染
            if (typeof slot === 'number' && Math.abs(slot) > SIDE) return null
            const word = getWord(name)
            if (!word) return null
            return (
              <Card
                key={name}
                word={word}
                slot={slot}
                revealed={slot === 0 && revealed}
                hovered={hoveredName === name}
                dots={revealCounts[name] || 0}
                onClick={() => {
                  if (slot === 0) toggleReveal()
                  else if (slot === 1 || slot === 'S') go(1)
                  else if (slot === -1) go(-1)
                }}
              />
            )
          })}
        </div>
      </div>

      <div className="hints" ref={hintsRef}>
        <span>
          <kbd>H</kbd>
          <kbd>L</kbd>/<kbd>←</kbd>
          <kbd>→</kbd> 翻页
        </span>
        <span>
          <kbd>Space</kbd> {revealed ? '重新播放' : '显示释义'}
        </span>
        <span>
          <kbd>Enter</kbd> 换一轮
        </span>
      </div>
    </div>
  )
}

type CardProps = {
  word: Word
  slot: Slot
  revealed?: boolean
  hovered?: boolean
  dots?: number
  onClick?: () => void
}

function Card({
  word,
  slot,
  revealed = false,
  hovered = false,
  dots = 0,
  onClick,
}: CardProps) {
  const isCenter = slot === 0

  return (
    <div
      className={`card pos-${slot}${isCenter ? ' active' : ''}${
        hovered ? ' hovered' : ''
      }`}
      data-word={word.word}
      onClick={onClick}
    >
      {/* 展开过几次：顶部居中的实心圆 */}
      {isCenter && dots > 0 && (
        <div className="dots">
          {dotColors(dots).map((c, i) => (
            <span key={i} className={`dot ${c}`} />
          ))}
        </div>
      )}
      <div className="inner">
        <div className="word">{word.word}</div>

        {/* 默认只显示单词；按空格后才显示音标和释义 */}
        {isCenter && revealed && (
          <div className="detail">
            <div className="phonetic">{word.phonetic}</div>
            <div className="definition">{word.definition}</div>
          </div>
        )}
      </div>

      {/* 释义展开时，tags 贴卡片底部，用 · 分隔 */}
      {isCenter && revealed && word.tags.length > 0 && (
        <div className="tag-list">
          {[...word.tags]
            .sort((a, b) => tagRank(a) - tagRank(b))
            .map((tag) => (
              <span className="tag" key={tag}>
                {tagLabel(tag)}
              </span>
            ))}
        </div>
      )}
    </div>
  )
}
