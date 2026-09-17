import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Book } from '../books'
import { filterKey, matchesFilter, saveFilter } from '../filter'
import { loadCompleted } from '../progress'
import {
  ROUND_SIZES,
  loadOrder,
  loadRoundSize,
  saveOrder,
  saveRoundSize,
} from '../rounds'
import { saveSession } from '../session'
import { words } from '../words'

/** 洗牌：返回打乱顺序的新数组 */
function shuffle(pool: number[]): number[] {
  const arr = [...pool]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = arr[i]
    arr[i] = arr[j]
    arr[j] = t
  }
  return arr
}

type Props = {
  book: Book
  onClose: () => void
}

/**
 * 点词书弹出的窗口。
 * 左栏：可滚动词表（未完成 / 已完成 切换），高度固定
 * 右栏：顶部 切换 + 5/10/20，底部 刷新 + 开始
 * 「本轮顺序」按词书持久化，重开不重排；5/10/20 也记住。
 */
export default function BookDialog({ book, onClose }: Props) {
  const navigate = useNavigate()

  const key = useMemo(() => filterKey(book.filter), [book])
  const all = useMemo(
    () => words.map((_, i) => i).filter((i) => matchesFilter(words[i], book.filter)),
    [book],
  )
  const completedSet = useMemo(() => new Set(loadCompleted()), [])

  const [size, setSize] = useState(loadRoundSize)
  const [view, setView] = useState<'todo' | 'done'>('todo')
  // 上一轮顺序；没有或对不上就重新洗牌
  const [order, setOrder] = useState<number[]>(() => {
    const stored = loadOrder(key)
    if (
      stored &&
      stored.length === all.length &&
      all.every((i) => stored.includes(i))
    ) {
      return stored
    }
    return shuffle(all)
  })

  // 顺序变化 → 按词书写回
  useEffect(() => {
    saveOrder(key, order)
  }, [key, order])

  const todo = useMemo(
    () => order.filter((i) => !completedSet.has(i)),
    [order, completedSet],
  )
  const done = useMemo(
    () => order.filter((i) => completedSet.has(i)),
    [order, completedSet],
  )
  const round = todo.slice(0, size)
  const list = view === 'todo' ? todo : done

  const pickSize = (n: number) => {
    setSize(n)
    saveRoundSize(n)
  }

  const start = () => {
    if (round.length === 0) return
    saveFilter(book.filter)
    saveSession({ key, indices: round })
    navigate('/study')
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal book-modal"
        role="dialog"
        aria-modal="true"
        aria-label={book.name}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="icon-btn modal-close"
          onClick={onClose}
          aria-label="关闭"
          title="关闭"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h2 className="modal-title">{book.name}</h2>

        <div className="book-body">
          {/* 左栏顶部：说明 */}
          <div className="book-list-head">
            {view === 'todo'
              ? `未完成 ${todo.length} 词 · 前 ${round.length} 个为「本轮」`
              : `已完成 ${done.length} 词`}
          </div>

          {/* 左栏：固定高度的可滚动词表 */}
          <div className="book-list">
            {list.length === 0 ? (
              <p className="book-empty">
                {view === 'todo' ? '✓ 全部完成' : '还没有已完成的词'}
              </p>
            ) : (
              list.map((i, idx) => {
                const isRound = view === 'todo' && idx < size
                return (
                  <span
                    key={i}
                    className={`word-row${isRound ? ' round' : ''}${
                      view === 'done' ? ' done' : ''
                    }`}
                  >
                    {words[i].word}
                  </span>
                )
              })
            )}
          </div>

          {/* 右栏：顶组贴列表顶，底组贴列表底 */}
          <aside className="book-side">
            <div className="side-group">
              <div className="seg" role="group" aria-label="查看">
                <button
                  type="button"
                  className={`seg-btn${view === 'todo' ? ' on' : ''}`}
                  onClick={() => setView('todo')}
                  aria-pressed={view === 'todo'}
                >
                  未完成
                </button>
                <button
                  type="button"
                  className={`seg-btn${view === 'done' ? ' on' : ''}`}
                  onClick={() => setView('done')}
                  aria-pressed={view === 'done'}
                >
                  已完成
                </button>
              </div>

              <div className="seg" role="group" aria-label="每轮词数">
                {ROUND_SIZES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`seg-btn${size === n ? ' on' : ''}`}
                    onClick={() => pickSize(n)}
                    aria-pressed={size === n}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="side-group">
              <button
                type="button"
                className="btn btn-ghost side-btn"
                onClick={() => setOrder(shuffle(all))}
                disabled={all.length === 0}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                刷新
              </button>

              <button
                type="button"
                className="btn btn-primary side-btn"
                onClick={start}
                disabled={round.length === 0}
              >
                开始学习 {round.length}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
