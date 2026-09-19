import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ThemeToggle from '../components/ThemeToggle'
import { CheckIcon, CloseIcon } from '../components/icons'
import { logout } from '../lib/auth'
import { words } from '../data/words'
import { matchesFilter } from '../lib/filter'
import type { Book } from '../lib/books'
import { MAX_BOOKS, loadBooks, saveBooks } from '../lib/books'
import BookDialog from './home/BookDialog'
import TagPicker from './home/TagPicker'

export default function Home() {
  const navigate = useNavigate()
  const location = useLocation()
  const [activeBook, setActiveBook] = useState<Book | null>(null)
  // 旧数据里的自动名「词书1/2…」规整为「词书」；自定义名保留
  const [books, setBooks] = useState<Book[]>(() =>
    loadBooks().map((b) =>
      /^词书\d+$/.test(b.name) ? { ...b, name: '词书' } : b,
    ),
  )
  // 没有词书 / 从 Study 跳回来要求选词书 → 自动弹出 TagPicker
  const [pickerOpen, setPickerOpen] = useState(() => {
    const st = location.state as { openPicker?: boolean } | null
    return !!st?.openPicker || books.length === 0
  })
  const [confirmId, setConfirmId] = useState<number | null>(null)

  // 清掉「要求弹选词书」的路由 state，避免刷新时重复弹
  useEffect(() => {
    const st = location.state as { openPicker?: boolean } | null
    if (st?.openPicker) {
      navigate(location.pathname, { replace: true, state: null })
    }
    // 只在挂载时清一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const atLimit = books.length >= MAX_BOOKS

  useEffect(() => {
    saveBooks(books)
  }, [books])

  return (
    <div className="page">
      {/* 词书区：中间大区域，+ 始终排在最后一本后面 */}
      <div className="bookshelf">
        <div className="bookshelf-inner">
          {books.map((book) => (
            <div
              className="book-item"
              key={book.id}
              onMouseLeave={() =>
                setConfirmId((c) => (c === book.id ? null : c))
              }
            >
              <button
                type="button"
                className="book"
                onClick={() => {
                  setConfirmId(null)
                  setActiveBook(book)
                }}
                title={`打开 ${book.name}`}
              >
                <span className="book-title">{book.name}</span>
                <span className="book-meta">
                  {words.filter((w) => matchesFilter(w, book.filter)).length} 词
                </span>
              </button>
              <button
                type="button"
                className={`book-del${confirmId === book.id ? ' confirm' : ''}`}
                onClick={() => {
                  if (confirmId === book.id) {
                    setBooks((b) => b.filter((x) => x.id !== book.id))
                    setActiveBook((a) => (a?.id === book.id ? null : a))
                    setConfirmId(null)
                  } else {
                    setConfirmId(book.id)
                  }
                }}
                aria-label={
                  confirmId === book.id
                    ? `再点一次删除 ${book.name}`
                    : `删除 ${book.name}`
                }
                title={
                  confirmId === book.id ? '再点一次确认删除' : `删除 ${book.name}`
                }
              >
                {confirmId === book.id ? (
                  <CheckIcon />
                ) : (
                  <CloseIcon size={14} strokeWidth={2.5} />
                )}
              </button>
            </div>
          ))}

          {!atLimit && (
            <button
              type="button"
              className="book book-add"
              onClick={() => setPickerOpen(true)}
              aria-label="新建词书"
              title="新建词书"
            >
              <svg
                width="30"
                height="30"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <ThemeToggle />

      <button
        type="button"
        className="icon-btn logout-btn"
        onClick={() => {
          logout()
          navigate('/login', { replace: true })
        }}
        aria-label="退出登录"
        title="退出登录"
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
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>

      {activeBook && (
        <BookDialog
          book={activeBook}
          onClose={() => setActiveBook(null)}
          onRename={(name) => {
            setBooks((bs) =>
              bs.map((x) => (x.id === activeBook.id ? { ...x, name } : x)),
            )
            setActiveBook((a) => (a ? { ...a, name } : a))
          }}
        />
      )}

      {pickerOpen && (
        <TagPicker
          existing={books.map((b) => b.filter)}
          onClose={() => setPickerOpen(false)}
          onConfirm={(filter) => {
            setBooks((b) => {
              if (b.length >= MAX_BOOKS) return b
              return [...b, { id: Date.now(), name: '词书', filter }]
            })
            setPickerOpen(false)
          }}
        />
      )}
    </div>
  )
}
