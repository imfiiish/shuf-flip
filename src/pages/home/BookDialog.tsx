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
  /** 重命名词书（提交时调用，name 已 trim 且非空） */
  onRename: (name: string) => void
}

/**
 * 点词书弹出的窗口：左栏是「本轮」的词表，右栏是操作。
 * 每轮从词书里随机推 20 个词；换一轮重掷；顺序按词书持久化，重开不重排。
 */
export default function BookDialog({ book, onClose, onRename }: Props) {
  const navigate = useNavigate()

  // 顶部标题改名：点击进入编辑，Enter / 失焦提交，Esc 取消
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(book.name)

  const commitRename = () => {
    const name = draft.trim()
    if (name && name !== book.name) onRename(name)
    else setDraft(book.name)
    setEditing(false)
  }

  const cancelRename = () => {
    setDraft(book.name)
    setEditing(false)
  }

  // Esc 关闭弹窗；改名编辑中时 Esc 只取消改名，不关窗
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || editing) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, onClose])

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

  // 点词 → 复制到剪贴板 + 播放发音
  const [copied, setCopied] = useState<string | null>(null)
  const copyTimer = useRef<number | undefined>(undefined)

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

  // 音频：同一时刻只播一个
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const playWord = (i: number) => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    const audio = new Audio(
      `${import.meta.env.BASE_URL}audio/${words[i].audio_file}`,
    )
    audio.preload = 'auto'
    audioRef.current = audio
    audio.addEventListener('ended', () => {
      if (audioRef.current === audio) audioRef.current = null
    })
    audio.play().catch(() => {})
  }

  // 预加载本轮音频，首次点击不延迟
  useEffect(() => {
    order.slice(0, ROUND_SIZE).forEach((i) => {
      const a = new Audio(
        `${import.meta.env.BASE_URL}audio/${words[i].audio_file}`,
      )
      a.preload = 'auto'
    })
  }, [order])

  // 卸载（含关闭弹窗）时清掉复制提示与正在播的音频
  useEffect(
    () => () => {
      window.clearTimeout(copyTimer.current)
      audioRef.current?.pause()
      audioRef.current = null
    },
    [],
  )

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

        <div className="modal-title-bar">
          {editing ? (
            <input
              className="modal-title-input"
              value={draft}
              autoFocus
              maxLength={24}
              aria-label="词书名称"
              placeholder="词书"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitRename()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  e.stopPropagation()
                  cancelRename()
                }
              }}
              onBlur={commitRename}
            />
          ) : (
            <button
              type="button"
              className="modal-title modal-title-edit"
              onClick={() => {
                setDraft(book.name)
                setEditing(true)
              }}
              aria-label={`词书名称：${book.name}，点击修改`}
              title="点击修改名称"
            >
              <span className="title-text">{book.name}</span>
              <svg
                className="edit-icon"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
              </svg>
            </button>
          )}
        </div>

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
                  onClick={() => {
                    copy(words[i].word)
                    playWord(i)
                  }}
                  title="点击复制并发音"
                >
                  <span className="word-text">{words[i].word}</span>
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
