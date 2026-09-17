import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../components/BackButton'
import type { Word } from '../data/words'
import { words } from '../data/words'
import { filterKey, loadFilter, matchesFilter } from '../lib/filter'
import {
  loadCenter,
  loadRevealCounts,
  saveCenter,
  saveRevealCounts,
} from '../lib/progress'
import { loadSession } from '../lib/session'
import { tagRank } from '../lib/tags'

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

/**
 * 学习页：只负责「翻」。
 * 牌组就是词书弹窗里那一轮（默认 20 个词），环形滑动，Space 展开。
 */
export default function Study() {
  const navigate = useNavigate()

  // 词书筛选 + 那一轮（session）；位置 center 按这一轮单独记
  const { centerKey, deck } = useMemo(() => {
    const f = loadFilter()
    const fk = filterKey(f)
    const book = words.map((_, i) => i).filter((i) => matchesFilter(words[i], f))
    const s = loadSession()
    if (s && s.key === fk) {
      const idx = s.indices.filter((i) => book.includes(i))
      if (idx.length > 0) {
        return { centerKey: `${fk}|${idx.join('.')}`, deck: idx }
      }
    }
    return { centerKey: fk, deck: book }
  }, [])
  const TOTAL = deck.length

  const [center, setCenter] = useState(() =>
    TOTAL ? Math.min(loadCenter(centerKey), TOTAL - 1) : 0,
  )

  useEffect(() => {
    saveCenter(centerKey, center)
  }, [centerKey, center])

  const centerIdx: number | null = deck.length ? deck[center] : null
  const centerWord: Word | null = centerIdx != null ? words[centerIdx] : null

  // 每个词「展开释义」的次数（只记 隐藏→显示 那次），存 localStorage，刷新后保留
  const [revealCounts, setRevealCounts] = useState<Record<number, number>>(
    loadRevealCounts,
  )

  useEffect(() => {
    saveRevealCounts(revealCounts)
  }, [revealCounts])

  // 中间卡片是否展示音标 + 释义
  const [revealed, setRevealed] = useState(false)

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

  // 翻页
  const go = useCallback(
    (delta: number) => {
      setRevealed(false)
      setCenter((c) => {
        if (TOTAL === 0) return 0
        return (c + delta + TOTAL) % TOTAL
      })
    },
    [TOTAL],
  )

  // 音频：按需播放。重播时先停掉上一次再新建实例，
  // 避免 currentTime=0 + play() 在快速连按时抢跑/叠加
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // 预加载这一轮的音频，首次播放不延迟
  useEffect(() => {
    deck.forEach((i) => {
      const a = new Audio(
        `${import.meta.env.BASE_URL}audio/${words[i].audio_file}`,
      )
      a.preload = 'auto'
    })
  }, [deck])

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

  // 键盘：Space 释义 / H L 翻页
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = e.key

      if (k === ' ') {
        e.preventDefault() // 防止页面滚动
        if (e.repeat) return // 按住时忽略自动重复，避免疯狂重播
        toggleReveal()
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
  }, [go, toggleReveal])

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
    <div className="app">
      <BackButton to="/" label="返回主页" />
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
