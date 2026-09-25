import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '../../components/Modal'
import { setActiveFilter, type Book } from '../../lib/books'
import { copyText } from '../../lib/clipboard'
import { filterKey } from '../../lib/filter'
import { api } from '../../lib/api'
import { useAudioPlayer } from '../../lib/audio'
import { useI18n } from '../../lib/i18n'
import { usePreloadWords, useWordDetails } from '../../lib/session'
import { findWord } from '../../data/words'

type Props = {
  book: Book
  onClose: () => void
  /** 重命名词书（提交时调用，name 已 trim 且非空） */
  onRename: (name: string) => void
}

/**
 * 点词书弹出的窗口：左栏是「本轮」的词表，右栏是操作。
 * 每轮从词书里随机推 ROUND_SIZE 个词；顺序按词书持久化，重开不重排（下一轮在 Study 页按 Enter）。
 */
export default function BookDialog({ book, onClose, onRename }: Props) {
  const navigate = useNavigate()
  const { t, contentLang } = useI18n()

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

  const key = useMemo(
    () => filterKey(book.filter, contentLang),
    [book, contentLang],
  )

  // 本轮由服务器发牌（与 /study 拿到的同一轮）
  const [words, setWords] = useState<string[]>([])
  useEffect(() => {
    let alive = true
    void api.studyRound(key, false).then(
      (res) => {
        if (alive) setWords(res.words)
      },
      () => {
        if (alive) setWords([])
      },
    )
    return () => {
      alive = false
    }
  }, [key])

  // 点词 → 复制到剪贴板 + 播放发音
  const [copied, setCopied] = useState<string | null>(null)
  const copyTimer = useRef<number | undefined>(undefined)

  // 卸载时清掉未触发的「已复制」计时器
  useEffect(() => () => window.clearTimeout(copyTimer.current), [])

  const showCopied = (word: string) => {
    setCopied(word)
    window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopied(null), 1100)
  }

  const copy = (word: string) => {
    void copyText(word).then((ok) => {
      if (ok) showCopied(word)
    })
  }

  // 音频：按需播放（同一时刻只播一个），并预加载本轮，首次点击不延迟
  const detailsReady = useWordDetails(words)
  const play = useAudioPlayer()
  const playWord = (name: string) => {
    const w = findWord(name)
    if (w) play(w.audio)
  }

  usePreloadWords(words, detailsReady)

  const start = () => {
    if (words.length === 0) return
    setActiveFilter(book.filter)
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
            aria-label={t('book.nameAria')}
            placeholder={t('book.namePlaceholder')}
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
            aria-label={t('book.nameEditAria', { name: book.name })}
            title={t('book.nameEditTitle')}
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
        <div className="book-list-head">{t('book.thisRound')}</div>

        {/* 左栏：本轮词表 */}
        <div className="book-list">
          {words.length === 0 ? (
            <p className="book-empty">{t('book.empty')}</p>
          ) : (
            words.map((name) => {
              const w = findWord(name)
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
                  title={t('book.copyPlay')}
                >
                  <span className="word-text">{w.word}</span>
                  {copied === w.word && (
                    <span className="copied-tag">{t('common.copied')}</span>
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
              disabled={words.length === 0}
            >
              {t('book.start')}
            </button>
          </div>
        </aside>
      </div>
    </Modal>
  )
}
