import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Word } from '../words'
import { words } from '../words'

const TOTAL = words.length

// tags 展示顺序（CEFR.A1/A2/B1/B2/C1/C2 都归到 CEFR；未列出的排最后）
const TAG_ORDER = [
  '初中',
  '高中',
  'CET4',
  'CET6',
  '考研',
  'IELTS',
  'TOEFL',
  'TEM4',
  'TEM8',
  'CEFR',
  'SAT',
  'GRE',
  'GMAT',
  'BEC',
] as const

function tagRank(tag: string): number {
  const i = TAG_ORDER.findIndex((t) => tag === t || tag.startsWith(`${t}.`))
  return i === -1 ? TAG_ORDER.length : i
}

/** 圆点的颜色：r 红 / y 黄 / g 绿 / empty 空位灰 */
type DotColor = 'r' | 'y' | 'g' | 'empty'

// 「展开释义」次数 → 3 个实心圆（左到右：红、黄、绿，其余灰）
// 规则：先加绿；满 3 个再 +1 时把绿合成 1 个黄；无绿且 3 黄时合成 1 个红
function dotColors(n: number): DotColor[] {
  let g = 0
  let y = 0
  let r = 0
  for (let i = 0; i < n; i++) {
    if (g + y + r < 3) g += 1
    else if (g > 0) {
      g = 0
      y += 1
    } else if (y === 3) {
      y = 0
      r += 1
    } else if (y > 0) {
      y -= 1
      r += 1
    } else {
      r += 1
    }
    while (g + y + r > 3) {
      if (g > 0) g -= 1
      else if (y > 0) y -= 1
      else r -= 1
    }
  }
  const out: DotColor[] = []
  for (let i = 0; i < r; i++) out.push('r')
  for (let i = 0; i < y; i++) out.push('y')
  for (let i = 0; i < g; i++) out.push('g')
  while (out.length < 3) out.push('empty')
  return out
}

// 每侧渲染 2 张：±1 可见，±2 是屏外过渡位（保证环形无缝）
const SIDE = 2

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

/** 牌组状态 */
type DeckState = {
  deck: number[]
  center: number
  completed: number[]
}

/** 「完成」飞出动画的临时副本 */
type Ghost = { id: number; word: Word }

function startState(): DeckState {
  return { deck: words.map((_, i) => i), center: 0, completed: [] }
}

export default function Study() {
  const navigate = useNavigate()
  const [state, setState] = useState<DeckState>(startState)
  const { deck, center, completed } = state
  const centerIdx: number | null = deck.length ? deck[center] : null
  const centerWord: Word | null = centerIdx != null ? words[centerIdx] : null
  // 每个词「展开释义」的次数（只记 隐藏→显示 那次）
  const [revealCounts, setRevealCounts] = useState<Record<number, number>>({})

  // 重做栈：被撤销（还原）的词，等待重新完成
  const [redoStack, setRedoStack] = useState<number[]>([])
  // 中间卡片是否展示音标 + 释义
  const [revealed, setRevealed] = useState(false)
  // 被「完成」的卡片：飞出动画的临时副本
  const [ghosts, setGhosts] = useState<Ghost[]>([])
  const ghostId = useRef(0)

  // 悬浮光晕：按「指针位置」命中，而不是 CSS :hover。
  // 否则卡片位移后，:hover 会粘在移动的那个元素上（光晕跟着卡片而不是鼠标）。
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const pointer = useRef<{ x: number; y: number } | null>(null)

  const updateHover = useCallback(() => {
    const pt = pointer.current
    if (!pt) return
    const el = document.elementFromPoint(pt.x, pt.y)
    const cardEl = el?.closest<HTMLElement>('.card[data-idx]')
    const idx = cardEl ? Number(cardEl.dataset.idx) : NaN
    setHoveredId(Number.isNaN(idx) ? null : idx)
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
    setHoveredId(null)
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

  const addGhost = useCallback((word: Word) => {
    const id = ++ghostId.current
    setGhosts((g) => [...g, { id, word }])
  }, [])

  // 翻页（不进撤销历史）
  const go = useCallback((delta: number) => {
    setRevealed(false)
    setState((s) => {
      if (s.deck.length === 0) return s
      const nc = (s.center + delta + s.deck.length) % s.deck.length
      return { ...s, center: nc }
    })
  }, [])

  // Enter：完成当前词 → 从牌组移除，自动前进到下一张
  const complete = useCallback(() => {
    if (deck.length === 0) return
    const done = deck[center]
    addGhost(words[done])
    const nextDeck = deck.filter((_, p) => p !== center)
    const nextCenter = nextDeck.length ? center % nextDeck.length : 0
    setState({
      deck: nextDeck,
      center: nextCenter,
      completed: [...completed, done],
    })
    setRedoStack([]) // 新的操作清空重做栈
    setRevealed(false)
  }, [deck, center, completed, addGhost])

  // 撤销：把最近完成的词还原回牌组，并把中心移回那张卡
  const undo = useCallback(() => {
    if (completed.length === 0) return
    const word = completed[completed.length - 1]
    const nextDeck = [...deck, word].sort((a, b) => a - b)
    setState({
      deck: nextDeck,
      center: nextDeck.indexOf(word),
      completed: completed.slice(0, -1),
    })
    setRedoStack((s) => [...s, word])
    setRevealed(false)
  }, [deck, completed])

  // 重做：把那次的词重新完成（移出牌组）
  const redo = useCallback(() => {
    if (redoStack.length === 0) return
    const word = redoStack[redoStack.length - 1]
    const p = deck.indexOf(word)
    if (p === -1) {
      setRedoStack((s) => s.slice(0, -1))
      return
    }
    addGhost(words[word])
    const nextDeck = deck.filter((_, i) => i !== p)
    const nextCenter = nextDeck.length ? p % nextDeck.length : 0
    setState({
      deck: nextDeck,
      center: nextCenter,
      completed: [...completed, word],
    })
    setRedoStack((s) => s.slice(0, -1))
    setRevealed(false)
  }, [redoStack, deck, completed, addGhost])

  // 音频：按需播放。重播时先停掉上一次再新建实例，
  // 避免 currentTime=0 + play() 在快速连按时抢跑/叠加
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // 预加载 5 个音频，首次播放不延迟
  useEffect(() => {
    words.forEach((w) => {
      const a = new Audio(`${import.meta.env.BASE_URL}audio/${w.audio_file}`)
      a.preload = 'auto'
    })
  }, [])

  // 卸载时停掉正在播的
  useEffect(
    () => () => {
      audioRef.current?.pause()
      audioRef.current = null
    },
    [],
  )

  const play = useCallback((file?: string) => {
    if (!file) return
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    const audio = new Audio(`${import.meta.env.BASE_URL}audio/${file}`)
    audio.preload = 'auto'
    audioRef.current = audio
    audio.play().catch(() => {})
  }, [])

  // 首次：显示释义 + 朗读；已显示：只重播
  const reveal = useCallback(() => {
    setRevealed(true)
    if (centerIdx != null) {
      setRevealCounts((c) => ({ ...c, [centerIdx]: (c[centerIdx] || 0) + 1 }))
    }
    play(centerWord?.audio_file)
  }, [play, centerWord, centerIdx])

  const toggleReveal = useCallback(() => {
    if (revealed) play(centerWord?.audio_file)
    else reveal()
  }, [revealed, play, reveal, centerWord])

  // 键盘：Space 释义 / H L 翻页 / Enter 完成 / Ctrl+C 撤销 / Ctrl+Shift+C 重做
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = e.key

      // 撤销 / 重做（Ctrl 或 Cmd）
      if (e.ctrlKey || e.metaKey) {
        const key = k.toLowerCase()
        if ((key === 'c' || key === 'z') && !e.shiftKey) {
          e.preventDefault()
          undo()
        } else if ((key === 'c' || key === 'z') && e.shiftKey) {
          e.preventDefault()
          redo()
        }
        return
      }

      if (k === ' ') {
        e.preventDefault() // 防止页面滚动
        if (e.repeat) return // 按住时忽略自动重复，避免疯狂重播
        toggleReveal()
        return
      }
      if (k === 'Enter') {
        e.preventDefault()
        if (e.repeat) return
        complete()
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
  }, [go, complete, undo, redo, toggleReveal])

  return (
    <div className="app">
      <button
        type="button"
        className="icon-btn back-btn"
        onClick={() => navigate('/')}
        aria-label="返回主页"
        title="返回主页"
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
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
      </button>
      <div
        className="cards"
        onMouseMove={onCardsMouseMove}
        onMouseLeave={onCardsMouseLeave}
      >
        {/* 固定按词序渲染，DOM 顺序稳定，翻页只改 transform → 平滑环形滑动 */}
        {deck.map((wordIndex, p) => {
          const slot = slotOf(p, center, deck.length)
          // 数字槽位超出窗口就不渲染；'B' / 'S' 始终渲染
          if (typeof slot === 'number' && Math.abs(slot) > SIDE) return null
          return (
            <Card
              key={wordIndex}
              idx={wordIndex}
              word={words[wordIndex]}
              slot={slot}
              revealed={slot === 0 && revealed}
              hovered={hoveredId === wordIndex}
              dots={revealCounts[wordIndex] || 0}
              onClick={() => {
                if (slot === 0) toggleReveal()
                else if (slot === 1 || slot === 'S') go(1)
                else if (slot === -1) go(-1)
              }}
            />
          )
        })}

        {/* 完成时的飞出副本 */}
        {ghosts.map((g) => (
          <div
            key={g.id}
            className="card ghost"
            onAnimationEnd={() =>
              setGhosts((list) => list.filter((x) => x.id !== g.id))
            }
          >
            <div className="inner">
              <div className="word">{g.word.word}</div>
              <div className="check">✓</div>
            </div>
          </div>
        ))}

        {deck.length === 0 && <div className="all-done">✓ 全部完成</div>}
      </div>

      <div className="hints">
        <span>
          <kbd>H</kbd>
          <kbd>L</kbd>/<kbd>←</kbd>
          <kbd>→</kbd> 翻页
        </span>
        <span>
          <kbd>Space</kbd> {revealed ? '重新播放' : '显示释义'}
        </span>
        <span>
          <kbd>Enter</kbd> 完成
        </span>
        <span className="progress">
          ✓ {completed.length} / {TOTAL}
        </span>
      </div>
    </div>
  )
}

type CardProps = {
  word: Word
  idx: number
  slot: Slot
  revealed?: boolean
  hovered?: boolean
  dots?: number
  onClick?: () => void
}

function Card({
  word,
  idx,
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
      data-idx={idx}
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
                {tag}
              </span>
            ))}
        </div>
      )}
    </div>
  )
}
