import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Book } from '../../lib/books'
import { filterKey, matchesFilter, saveFilter } from '../../lib/filter'
import { loadOrder, saveOrder } from '../../lib/rounds'
import { saveSession } from '../../lib/session'
import { words } from '../../data/words'

/** 每轮推送的词数 */
const ROUND_SIZE = 20

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

/** clipboard API 不可用时的兜底复制 */
function fallbackCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

type Props = {
  book: Book
  onClose: () => void
}

/**
 * 点词书弹出的窗口：左栏是「本轮」的词表，右栏是操作。
 * 每轮从词书里随机推 20 个词；换一轮重掷；顺序按词书持久化，重开不重排。
 */
export default function BookDialog({ book, onClose }: Props) {
  const navigate = useNavigate()

  const key = useMemo(() => filterKey(book.filter), [book])
  const all = useMemo(
    () => words.map((_, i) => i).filter((i) => matchesFilter(words[i], book.filter)),
    [book],
  )

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

  const round = order.slice(0, ROUND_SIZE)

  // 点词 → 复制到剪贴板，并弹一下提示
  const [copied, setCopied] = useState<string | null>(null)
  const copyTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(copyTimer.current), [])

  const showCopied = (word: string) => {
    setCopied(word)
    window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopied(null), 1100)
  }

  const copy = (word: string) => {
    const p = navigator.clipboard?.writeText(word)
    if (p) {
      p.then(() => showCopied(word)).catch(() => {
        if (fallbackCopy(word)) showCopied(word)
      })
    } else if (fallbackCopy(word)) {
      showCopied(word)
    }
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
          <div className="book-list-head">本轮</div>

          {/* 左栏：本轮词表 */}
          <div className="book-list">
            {round.length === 0 ? (
              <p className="book-empty">这本词书还没有词</p>
            ) : (
              round.map((i) => (
                <button
                  type="button"
                  className="word-row"
                  key={i}
                  onClick={() => copy(words[i].word)}
                  title="点击复制"
                >
                  {words[i].word}
                  {copied === words[i].word && (
                    <span className="copied-tag">已复制</span>
                  )}
                </button>
              ))
            )}
          </div>

          {/* 右栏：操作 */}
          <aside className="book-side">
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
                换一轮
              </button>

              <button
                type="button"
                className="btn btn-primary side-btn"
                onClick={start}
                disabled={round.length === 0}
              >
                开始学习
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
