import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '../../components/Modal'
import type { Book } from '../../lib/books'
import { filterKey, matchesFilter, saveFilter } from '../../lib/filter'
import { fitOrder, loadOrder, ROUND_SIZE, saveOrder } from '../../lib/rounds'
import { getWord } from '../../lib/dict'
import { preloadAudio, useAudioPlayer } from '../../lib/audio'
import { words } from '../../data/words'

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
 * 每轮从词书里随机推 20 个词；顺序按词书持久化，重开不重排（下一轮在 Study 页按 Enter）。
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

  const key = useMemo(() => filterKey(book.filter), [book])
  const all = useMemo(
    () => words.filter((w) => matchesFilter(w, book.filter)).map((w) => w.word),
    [book],
  )

  // 本轮顺序：保留仍存在的词、新词追加到末尾（词库变动不再整池重洗）
  const [order] = useState<string[]>(() => fitOrder(loadOrder(key), all))

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

  // 音频：按需播放（同一时刻只播一个），并预加载本轮，首次点击不延迟
  const play = useAudioPlayer()
  const playWord = (name: string) => {
    const w = getWord(name)
    if (w) play(w.audio_file)
  }

  useEffect(() => {
    preloadAudio(
      order.slice(0, ROUND_SIZE).flatMap((name) => {
        const w = getWord(name)
        return w ? [w.audio_file] : []
      }),
    )
  }, [order])

  useEffect(() => () => window.clearTimeout(copyTimer.current), [])

  const start = () => {
    if (round.length === 0) return
    saveFilter(book.filter)
    navigate('/study')
  }

  return (
    <Modal
      onClose={onClose}
      ariaLabel={book.name}
      className="book-modal"
      closeOnEscape={!editing}
    >
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
            round.map((name) => {
              const w = getWord(name)
              if (!w) return null
              return (
                <button
                  type="button"
                  className="word-row"
                  key={name}
                  onClick={() => {
                    copy(w.word)
                    playWord(name)
                  }}
                  title="点击复制并发音"
                >
                  <span className="word-text">{w.word}</span>
                  {copied === w.word && (
                    <span className="copied-tag">已复制</span>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* 右栏：操作 */}
        <aside className="book-side">
          <div className="side-group">
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
    </Modal>
  )
}
