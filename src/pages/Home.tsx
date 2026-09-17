import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { logout } from '../auth'
import type { Book } from '../books'
import { loadBooks, saveBooks } from '../books'
import TagPicker from '../components/TagPicker'
import ThemeToggle from '../components/ThemeToggle'
import { sameFilter, saveFilter } from '../filter'

export default function Home() {
  const navigate = useNavigate()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [books, setBooks] = useState<Book[]>(loadBooks)

  useEffect(() => {
    saveBooks(books)
  }, [books])

  const openBook = (book: Book) => {
    saveFilter(book.filter)
    navigate('/study')
  }

  return (
    <div className="page home-page">
      {/* 词书区：中间大区域，+ 始终排在最后一本后面 */}
      <div className="bookshelf">
        <div className="bookshelf-inner">
          {books.map((book) => (
            <button
              key={book.id}
              type="button"
              className="book"
              onClick={() => openBook(book)}
              title={`打开 ${book.name}`}
            >
              <span className="book-title">{book.name}</span>
              <span className="book-meta">{book.count} 词</span>
            </button>
          ))}

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

      {pickerOpen && (
        <TagPicker
          existing={books.map((b) => b.filter)}
          onClose={() => setPickerOpen(false)}
          onConfirm={(filter, count) => {
            setBooks((b) => {
              if (b.some((x) => sameFilter(x.filter, filter))) return b
              return [
                ...b,
                { id: Date.now(), name: `词书${b.length + 1}`, filter, count },
              ]
            })
            setPickerOpen(false)
          }}
        />
      )}
    </div>
  )
}
