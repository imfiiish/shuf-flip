import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ThemeToggle from '../components/ThemeToggle'
import SettingsDialog from '../components/SettingsDialog'
import { CheckIcon, CloseIcon, GithubIcon, SettingsIcon } from '../components/icons'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/auth'
import { filterKey } from '../lib/filter'
import { fetchSummary } from '../lib/study'
import type { StudySummary } from '../lib/api'
import type { Book } from '../lib/books'
import { MAX_BOOKS, bookLang, loadBooks, saveBooks } from '../lib/books'
import BookDialog from './home/BookDialog'
import TagPicker from './home/TagPicker'

export default function Home() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useSession()
  const { t, contentLang } = useI18n()
  const [activeBook, setActiveBook] = useState<Book | null>(null)
  // 旧数据里的自动名「词书1/2…」规整为「词书」；自定义名保留
  const [books, setBooks] = useState<Book[]>(() =>
    loadBooks().map((b) =>
      /^词书\d+$/.test(b.name) ? { ...b, name: '词书' } : b,
    ),
  )
  // 没有词书 / 从 Study 跳回来要求选词书 → 自动弹出 TagPicker
  // 只展示当前学习内容语言的词书（两种语言不混）
  const shown = books.filter((b) => bookLang(b) === contentLang)
  const [pickerOpen, setPickerOpen] = useState(() => {
    const st = location.state as { openPicker?: boolean } | null
    return !!st?.openPicker || shown.length === 0
  })
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // 清掉「要求弹选词书」的路由 state，避免刷新时重复弹
  useEffect(() => {
    const st = location.state as { openPicker?: boolean } | null
    if (st?.openPicker) {
      navigate(location.pathname, { replace: true, state: null })
    }
    // 只在挂载时清一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const atLimit = shown.length >= MAX_BOOKS

  useEffect(() => {
    saveBooks(books)
  }, [books])

  // 每本书的 total/met/revealed 由服务器汇总
  const [summaries, setSummaries] = useState<Record<number, StudySummary>>({})
  useEffect(() => {
    let alive = true
    void Promise.all(
      shown.map((b) =>
        fetchSummary(filterKey(b.filter, contentLang)).then(
          (s) => [b.id, s] as const,
          () => [b.id, { total: 0, met: 0, revealed: 0 }] as const,
        ),
      ),
    ).then((entries) => {
      if (alive) setSummaries(Object.fromEntries(entries))
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books, contentLang])

  return (
    <div className="page">
      {/* 词书区：中间大区域，+ 始终排在最后一本后面 */}
      <div className="bookshelf">
        <div className="bookshelf-inner">
          {shown.map((book) => {
            const s = summaries[book.id]
            const total = s?.total ?? 0
            const met = s?.met ?? 0
            const revealed = s?.revealed ?? 0
            const metPct = total ? (met / total) * 100 : 0
            const revPct = total ? (revealed / total) * 100 : 0
            return (
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
                title={t('home.bookTitle', {
                  name: book.name,
                  met,
                  revealed,
                  total,
                })}
              >
                <span className="spine" aria-hidden="true">
                  <span
                    className="spine-yellow"
                    style={{ height: `${metPct}%` }}
                  />
                  <span
                    className="spine-green"
                    style={{ height: `${revPct}%` }}
                  />
                </span>
                <span className="book-title">{book.name}</span>
                <span className="book-meta">
                  {t('home.bookWords', { total })}
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
                    ? t('home.confirmDeleteBook', { name: book.name })
                    : t('home.deleteBook', { name: book.name })
                }
                title={
                  confirmId === book.id
                    ? t('home.confirmDelete')
                    : t('home.deleteBook', { name: book.name })
                }
              >
                {confirmId === book.id ? (
                  <CheckIcon />
                ) : (
                  <CloseIcon size={14} strokeWidth={2.5} />
                )}
              </button>
            </div>
            )
          })}

          {!atLimit && (
            <button
              type="button"
              className="book book-add"
              onClick={() => setPickerOpen(true)}
              aria-label={t('home.addBook')}
              title={t('home.addBook')}
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

      {/* 设置入口：语言切换 */}
      <button
        type="button"
        className="icon-btn settings-btn"
        onClick={() => setSettingsOpen(true)}
        aria-label={t('home.settings')}
        title={t('home.settings')}
      >
        <SettingsIcon />
      </button>

      {/* 右上角：跳转 GitHub 仓库 */}
      <a
        className="icon-btn github-btn"
        href="https://github.com/imfiiish/shuf-flip"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('home.github')}
        title={t('home.github')}
      >
        <GithubIcon />
      </a>

      <button
        type="button"
        className="icon-btn logout-btn"
        onClick={() => {
          void logout()
          navigate('/login', { replace: true })
        }}
        aria-label={t('home.logout')}
        title={t('home.logout')}
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
          existing={shown.map((b) => b.filter)}
          onClose={() => setPickerOpen(false)}
          onConfirm={(filter) => {
            setBooks((b) => {
              if (shown.length >= MAX_BOOKS) return b
              return [
                ...b.map((x) => ({ ...x, active: false })),
                {
                  id: Date.now(),
                  name: t('home.defaultBook'),
                  filter,
                  lang: contentLang,
                  active: true,
                },
              ]
            })
            setPickerOpen(false)
          }}
        />
      )}

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
