import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'
import { Navigate } from 'react-router-dom'
import BackButton from '../components/BackButton'
import type { Word } from '../data/words'
import { words } from '../data/words'
import { preloadAudio, useAudioPlayer } from '../lib/audio'
import { loadBooks } from '../lib/books'
import type { TagFilter } from '../lib/filter'
import { filterKey, loadFilter, matchesFilter, saveFilter } from '../lib/filter'
import { loadCenter, loadRevealStore, saveCenter, saveRevealStore } from '../lib/progress'
import { drawRound, fitOrder, loadOrder, ROUND_SIZE, saveOrder } from '../lib/rounds'
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

/** Study 挂载时的初始状态（只算一次） */
type StudyInit = {
  fk: string
  /** 当前词池 */
  book: string[]
  /** 校准后的完整词序；一轮 = order.slice(0, ROUND_SIZE) */
  order: string[]
  /** 自动进入某本词书时需要落盘的筛选（续上次时为 null） */
  filter: TagFilter | null
  /** 一本词书都没有：回主页并弹出 TagPicker */
  needPick: boolean
}

/**
 * 学习页：只负责「翻」。
 * 牌组就是词书弹窗里那一轮（默认 20 个词），环形滑动，Space 展开，Enter 下一轮。
 */
export default function Study() {
  // 初始状态只算一次（StrictMode 下 render 会跑两遍，避免洗出两轮不同的牌）。
  // 一轮的唯一来源是 vocab-round-orders（不再单独存 session）：
  //  1) 续上次：当前筛选存过顺序，且校准后仍有词 → 继续
  //  2) 否则有词书：进「最新创建」且有词的那本，直接开一轮（等价于点「开始学习」）
  //  3) 一本词书都没有 → 回主页并弹 TagPicker
  const initRef = useRef<StudyInit | null>(null)
  if (!initRef.current) {
    const poolOf = (filter: TagFilter) =>
      words.filter((w) => matchesFilter(w, filter)).map((w) => w.word)

    const f = loadFilter()
    const fk = filterKey(f)
    const book = poolOf(f)
    const stored = loadOrder(fk)
    const fitted = stored ? fitOrder(stored, book) : null
    if (fitted && fitted.length > 0) {
      initRef.current = { fk, book, order: fitted, filter: null, needPick: false }
    } else {
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
          order: fitOrder(loadOrder(next.key), next.pool),
          filter: next.filter,
          needPick: false,
        }
      } else {
        initRef.current = {
          fk,
          book,
          order: [],
          filter: null,
          needPick: books.length === 0,
        }
      }
    }
  }
  const init = initRef.current!
  const { fk, book, needPick } = init
  const round = init.order.slice(0, ROUND_SIZE)
  const hasRound = round.length > 0

  const [deck, setDeck] = useState(round)

  // 把校准后的顺序 / 自动进入时的筛选落盘，刷新后一致
  useEffect(() => {
    if (init.order.length === 0) return
    saveOrder(init.fk, init.order)
    if (init.filter) saveFilter(init.filter)
    // 只在挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // 下一轮时递增，给舞台换 key → 重放进入 Study 页的入场动画（.cards 的 app-in）
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
    logEvent('card', {
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
  const emitExit = useCallback((reason: 'back' | 'unload') => {
    if (exitSentRef.current) return
    exitSentRef.current = true
    logEvent('study_exit', { reason })
  }, [])

  // 进入学习：开始会话，记 study_enter / 首组 / 首张（StrictMode 下只执行一次）
  useEffect(() => {
    if (!hasRound) return // 没有有效的一轮：马上重定向，不记这次学习
    if (enteredRef.current) return
    enteredRef.current = true
    if (revealInit.previousDay) {
      logEvent('counts_reset', {
        from: revealInit.previousDay,
        to: revealInit.store.day,
      })
    }
    beginSession()
    logEvent('study_enter', { filterKey: fk })
    logEvent('round_new', { index: roundIndexRef.current, words: deck })
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
        logEvent('away', { away: awayNow, by })
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
      if (!hasRound) return // 没真正进入过（重定向中），没有可收尾的
      queueMicrotask(() => {
        if (!aliveRef.current) {
          leaveFnRef.current()
          emitExit('back')
        }
      })
    }
  }, [emitExit, hasRound])

  // 翻页
  const go = useCallback(
    (delta: number) => {
      if (TOTAL === 0) return
      emitCardLeave()
      const next = (center + delta + TOTAL) % TOTAL
      beginCard(delta > 0 ? 'right' : 'left')
      setRevealed(false)
      setCenter(next)
    },
    [TOTAL, center, emitCardLeave, beginCard],
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

  // 下一轮：洗整本词书，取前 ROUND_SIZE 个作为新的一轮，并持久化
  const nextRound = useCallback(() => {
    if (book.length === 0) return
    const { order, round } = drawRound(book)
    saveOrder(fk, order)
    emitCardLeave()
    roundIndexRef.current += 1
    logEvent('round_new', { index: roundIndexRef.current, words: round })
    if (round[0]) beginCard('init')
    setRevealed(false)
    setHoveredName(null)
    setDeck(round)
    setCenter(0)
    setRoundTick((t) => t + 1)
  }, [book, fk, emitCardLeave, beginCard])

  // 键盘：Space 释义 / Enter 下一轮 / H L 翻页
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

  // 没有有效的一轮 → 回主页重新选词书（用 <Navigate>，不先闪一下整池）
  if (!hasRound)
    return (
      <Navigate
        to="/"
        replace
        state={needPick ? { openPicker: true } : undefined}
      />
    )

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
          <kbd>Enter</kbd> 下一轮
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
