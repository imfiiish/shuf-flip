import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'
import type { Word } from '../data/words'
import { getWord } from '../lib/dict'
import { tagLabel, tagRank } from '../lib/tags'

/** 圆点的颜色：r 红 / y 黄 / g 绿 / empty 空位灰 */
type DotColor = 'r' | 'y' | 'g' | 'empty'

// 「展开释义」次数 → 3 个实心圆：
//   1~3 次：1/2/3 绿；4~6 次：1/2/3 黄；7~9 次：1/2/3 红
//   9 次以后照常计数，但显示停在 3 个红
const DOT_TIERS: DotColor[] = ['g', 'y', 'r']
export function dotColors(n: number): DotColor[] {
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
export const STAGE_W = 1200
export const STAGE_H = 360

/** 卡片槽位：数字为环形位置，'B' 偶数张的正背面，'S' 只剩两张时的右侧位 */
export type Slot = number | 'B' | 'S'

// 计算某个卡片（deck 里的位置）相对当前中心的位置：
// 0 居中，±1 可见，±2 屏外过渡位；偶数张时正背面用 'B'（藏在中间背后）
export function slotOf(p: number, center: number, n: number): Slot {
  let d = (p - center) % n
  if (d < 0) d += n
  // 只剩两张：另一张露出 3/5
  if (n === 2) return d === 0 ? 0 : 'S'
  if (n % 2 === 0 && d === n / 2) return 'B'
  if (d > n / 2) d -= n
  return d
}

/**
 * A1 等比缩放：舞台内部保持 1200×360 设计尺寸，
 * 按「视口 - 留白 - 提示行」算缩放比（≤1）。页面把返回的 ref 挂到
 * `.app` 和最底部那行（`.hints` / `.quiz-bar`）上。
 */
export function useStageScale(): {
  appRef: React.RefObject<HTMLDivElement>
  hintsRef: React.RefObject<HTMLDivElement>
  scale: number
} {
  const appRef = useRef<HTMLDivElement>(null)
  const hintsRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(() => {
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
      setScale(Math.max(0.2, Math.min(1, availW / STAGE_W, availH / STAGE_H)))
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

  return { appRef, hintsRef, scale }
}

type CardDeckProps = {
  /** 牌堆（word 字符串，按固定顺序） */
  deck: string[]
  /** 当前中心在 deck 里的下标 */
  center: number
  /** 中心卡是否展开释义 */
  revealed?: boolean
  /** 展开次数（word → 次数），用于圆点 */
  revealCounts?: Record<string, number>
  /** 舞台缩放比（来自 useStageScale） */
  scale: number
  /** 变化时给舞台换 key，重放入场动画 */
  stageKey?: number | string
  /** 点卡片：slot=0 是中心（展开），±1 / 'S' 是相邻（翻页） */
  onCardClick?: (name: string, slot: Slot) => void
}

/**
 * 卡片环形舞台：所有卡片绝对定位在中心，靠 transform 环形滑动。
 * Study / Quiz 共用；翻页、展开、悬浮光晕与缩放都在这里。
 */
export default function CardDeck({
  deck,
  center,
  revealed = false,
  revealCounts = {},
  scale,
  stageKey,
  onCardClick,
}: CardDeckProps) {
  const TOTAL = deck.length

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

  return (
    <div
      className="stage"
      key={stageKey}
      style={{ '--stage-scale': scale } as CSSProperties}
    >
      <div
        className="cards"
        onMouseMove={onCardsMouseMove}
        onMouseLeave={onCardsMouseLeave}
      >
        {/* 固定按词序渲染，DOM 顺序稳定，翻页只改 transform → 平滑环形滑动 */}
        {deck.map((name, p) => {
          const slot = slotOf(p, center, TOTAL)
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
              onClick={() => onCardClick?.(name, slot)}
            />
          )
        })}
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
