import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import BackButton from '../components/BackButton'
import CardDeck, { useStageScale, type Slot } from '../components/CardDeck'
import StudyHelp from '../components/StudyHelp'
import { useAudioPlayer } from '../lib/audio'
import { activeFilter, loadBooks, setActiveFilter } from '../lib/books'
import type { TagFilter } from '../lib/filter'
import { filterKey, poolOf } from '../lib/filter'
import { loadRevealStore, saveRevealStore } from '../lib/progress'
import { findWord, type Word } from '../data/words'
import { api, ApiError, type StudyRound } from '../lib/api'
import {
  queueState,
  sendStateBeacon,
  sendStateNow,
  type RoundState,
} from '../lib/study'
import { copyText } from '../lib/clipboard'
import { useWheelFlip } from '../lib/wheel'
import { useDoubleRightClick } from '../lib/rightclick'
import { logicalDay } from '../lib/day'
import { loadQuiz, startQuiz } from '../lib/quiz'
import { useExitLifecycle, usePreloadWords, useWordDetails } from '../lib/session'

/** 每学完这么多轮，活跃窗口换新前插入一次 Quiz */
const QUIZ_EVERY = 8

type Phase = 'loading' | 'ready' | 'needPick' | 'error'

/** 选一本要学的词书（用本地索引判断哪本有词） */
function pickBook(): { fk: string; filter: TagFilter | null; needPick: boolean } {
  const books = loadBooks()
  const f = activeFilter(books)
  if (f) {
    const fk = filterKey(f)
    if (poolOf(f).length > 0) return { fk, filter: null, needPick: false }
  }
  const next = [...books]
    .sort((a, b) => b.id - a.id)
    .map((b) => ({
      filter: b.filter,
      key: filterKey(b.filter),
      pool: poolOf(b.filter),
    }))
    .find((b) => b.pool.length > 0)
  if (next) return { fk: next.key, filter: next.filter, needPick: false }
  return {
    fk: filterKey(f ?? { include: [], exclude: [] }),
    filter: null,
    needPick: books.length === 0,
  }
}

export default function Study() {
  const navigate = useNavigate()

  // 已到 quiz 边界（Quiz 已 arm）时，/study 一律重定向到 /quiz
  const quizArmed = useMemo(() => loadQuiz() !== null, [])

  const [phase, setPhase] = useState<Phase>('loading')
  const [deck, setDeck] = useState<string[]>([])
  const [center, setCenter] = useState(0)
  const [roundTick, setRoundTick] = useState(0)

  // 上报用的可变引用（避免闭包过期）
  const fkRef = useRef('')
  const roundIdRef = useRef(0)
  const roundRRef = useRef(0)
  const centerRef = useRef(0)
  const deckRef = useRef<string[]>([])
  const metMaskRef = useRef(0)
  const checkedMaskRef = useRef(0)
  centerRef.current = center

  /** 组装当前进度（位图） */
  const buildState = useCallback(
    (): RoundState => ({
      roundId: roundIdRef.current,
      center: centerRef.current,
      metMask: metMaskRef.current,
      checkedMask: checkedMaskRef.current,
    }),
    [],
  )

  const applyRound = useCallback((res: StudyRound) => {
    fkRef.current = res.fk
    roundIdRef.current = res.roundId
    roundRRef.current = res.r
    deckRef.current = res.round
    metMaskRef.current = res.metMask ?? 0
    checkedMaskRef.current = res.checkedMask ?? 0
    setDeck(res.round)
    setCenter(res.round.length ? Math.min(res.center, res.round.length - 1) : 0)
    setRoundTick((t) => t + 1)
  }, [])

  // A1 等比缩放（舞台 1200×360）+ 底部提示行测量
  const { appRef, hintsRef, scale } = useStageScale()

  // 中间卡片是否展示音标 + 释义
  const [revealed, setRevealed] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  // 复制提示
  const [copyNotice, setCopyNotice] = useState<string | null>(null)
  const copyTimerRef = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(copyTimerRef.current), [])
  const clearCopy = useCallback(() => {
    window.clearTimeout(copyTimerRef.current)
    setCopyNotice(null)
  }, [])

  // 展开次数（当天圆点，本地）
  const initialReveal = useRef<ReturnType<typeof loadRevealStore> | null>(null)
  if (!initialReveal.current) initialReveal.current = loadRevealStore()
  const revealInit = initialReveal.current!
  const [revealCounts, setRevealCounts] = useState<Record<string, number>>(
    revealInit.counts,
  )
  const dayRef = useRef(revealInit.day)

  useEffect(() => {
    saveRevealStore({ day: dayRef.current, counts: revealCounts })
  }, [revealCounts])

  const ensureDay = useCallback((): boolean => {
    const today = logicalDay()
    if (dayRef.current === today) return false
    dayRef.current = today
    setRevealCounts({})
    return true
  }, [])

  // 进入学习：取当前轮（服务器发牌）
  const initRef = useRef(false)
  useEffect(() => {
    if (quizArmed || initRef.current) return
    initRef.current = true
    const choice = pickBook()
    if (choice.needPick) {
      setPhase('needPick')
      return
    }
    void api.studyRound(choice.fk, false).then(
      (res) => {
        if (choice.filter) setActiveFilter(choice.filter)
        applyRound(res)
        setPhase('ready')
      },
      (e) => {
        if (e instanceof ApiError && e.code === 'empty') setPhase('needPick')
        else setPhase('error')
      },
    )
  }, [quizArmed, applyRound])

  const deckKey = useMemo(() => deck.join('.'), [deck])
  const TOTAL = deck.length
  const centerName: string | null = deck.length ? deck[center] : null
  const centerWord: Word | null = centerName
    ? (findWord(centerName) ?? null)
    : null

  // 中心卡变化 → 记「碰到」+ 上报进度
  useEffect(() => {
    if (phase !== 'ready' || !centerName) return
    metMaskRef.current |= 1 << centerRef.current
    queueState(buildState())
  }, [phase, center, centerName, deckKey, buildState])

  // 聚焦拉、失焦推（多浏览器共用同一账号时同步）
  const pullAndApply = useCallback(async () => {
    const f = fkRef.current
    if (!f || roundIdRef.current <= 0) return
    try {
      const res = await api.studyRound(f, false)
      if (res.roundId !== roundIdRef.current) {
        // 另一浏览器推进过：跟着跳到新轮
        applyRound(res)
        setRevealed(false)
        clearCopy()
      } else {
        // 同一轮：合并远端位图，位置以后写为准
        metMaskRef.current |= res.metMask
        checkedMaskRef.current |= res.checkedMask
        setCenter(
          res.round.length ? Math.min(res.center, res.round.length - 1) : 0,
        )
      }
    } catch {
      /* 拉取失败忽略 */
    }
  }, [applyRound, clearCopy])

  useEffect(() => {
    if (phase !== 'ready') return
    const push = () => sendStateNow(buildState())
    const pull = () => void pullAndApply()
    const onVis = () => {
      if (document.hidden) push()
      else pull()
    }
    window.addEventListener('blur', push)
    window.addEventListener('focus', pull)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('blur', push)
      window.removeEventListener('focus', pull)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [phase, buildState, pullAndApply])

  // 关页/卸载保底
  useExitLifecycle({
    onPageHide: () => sendStateBeacon(buildState()),
    onUnmount: () => sendStateNow(buildState()),
  })

  // 翻页
  const go = useCallback(
    (delta: number) => {
      if (TOTAL === 0) return
      const next = (center + delta + TOTAL) % TOTAL
      setRevealed(false)
      clearCopy()
      setCenter(next)
    },
    [TOTAL, center, clearCopy],
  )

  useWheelFlip(go)

  const detailsReady = useWordDetails(deck)
  const play = useAudioPlayer()
  usePreloadWords(deck, detailsReady)

  const reveal = useCallback(() => {
    ensureDay()
    setRevealed(true)
    const name = deckRef.current[centerRef.current]
    if (name) {
      setRevealCounts((c) => ({ ...c, [name]: (c[name] || 0) + 1 }))
      checkedMaskRef.current |= 1 << centerRef.current
      queueState(buildState())
    }
    play(centerWord?.audio)
  }, [play, centerWord, ensureDay, buildState])

  const toggleReveal = useCallback(() => {
    if (revealed) play(centerWord?.audio)
    else reveal()
  }, [revealed, play, reveal, centerWord])

  const copyCurrent = useCallback(() => {
    if (!centerName) return
    void copyText(centerName).then((ok) => {
      if (!ok) return
      window.clearTimeout(copyTimerRef.current)
      setCopyNotice('已复制')
      copyTimerRef.current = window.setTimeout(() => setCopyNotice(null), 1000)
    })
  }, [centerName])

  // 下一轮：到 quiz 边界先插 quiz；否则向服务器要下一轮
  const nextRound = useCallback(() => {
    const f = fkRef.current
    if (!f) return
    const r = roundRRef.current

    const doAdvance = () => {
      sendStateNow(buildState())
      void api.studyRound(f, true).then(
        (res) => {
          applyRound(res)
          setRevealed(false)
          clearCopy()
        },
        () => {
          /* 失败：保留当前轮，等用户再按 */
        },
      )
    }

    // 到 quiz 边界：向服务器要题（待考池在服务器算）
    if (r > 0 && r % QUIZ_EVERY === 0) {
      void api.studyQuiz(f, r).then(
        (res) => {
          if (res.quizId != null && res.words.length > 0) {
            startQuiz(f, r, res.quizId, res.words)
            sendStateNow(buildState())
            navigate('/quiz')
          } else {
            doAdvance() // 没待考词：正常下一轮
          }
        },
        () => doAdvance(),
      )
      return
    }
    doAdvance()
  }, [applyRound, buildState, clearCopy, navigate])

  // 键盘：Space 释义 / Enter 下一轮 / H L 翻页
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = e.key
      if (k === '?') {
        e.preventDefault()
        if (e.repeat) return
        setHelpOpen((v) => !v)
        return
      }
      if (helpOpen) return
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && k.toLowerCase() === 'c') {
        e.preventDefault()
        if (e.repeat) return
        copyCurrent()
        return
      }
      if (k === ' ') {
        e.preventDefault()
        if (e.repeat) return
        toggleReveal()
        return
      }
      if (k === 'Enter') {
        e.preventDefault()
        if (e.repeat) return
        nextRound()
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
  }, [go, toggleReveal, nextRound, copyCurrent, helpOpen])

  useDoubleRightClick(nextRound, {
    ignore: (target) => !!target?.closest('.card.active'),
  })

  if (quizArmed) return <Navigate to="/quiz" replace />
  if (phase === 'needPick')
    return <Navigate to="/" replace state={{ openPicker: true }} />
  if (phase === 'error')
    return <div className="load-error">加载失败，请刷新重试</div>
  if (phase === 'loading') return <div className="load-error">加载中…</div>

  const onCardClick = (_name: string, slot: Slot) => {
    if (slot === 0) toggleReveal()
    else if (slot === 1 || slot === 'S') go(1)
    else if (slot === -1) go(-1)
  }

  return (
    <div className="app" ref={appRef}>
      <BackButton to="/" label="返回主页" />
      <button
        type="button"
        className="icon-btn next-round-btn"
        onClick={nextRound}
        aria-label="下一轮"
        title="下一轮"
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
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </button>

      <CardDeck
        deck={deck}
        center={center}
        revealed={revealed}
        centerNotice={copyNotice}
        revealCounts={revealCounts}
        scale={scale}
        stageKey={roundTick}
        onCardClick={onCardClick}
        onCardContextMenu={copyCurrent}
      />

      <div className="hints" ref={hintsRef}>
        <button
          type="button"
          className="hint-btn"
          onClick={(e) => {
            e.currentTarget.blur()
            setHelpOpen(true)
          }}
        >
          <kbd>?</kbd> 帮助
        </button>
        <span>
          <kbd>Space</kbd> {revealed ? '重新播放' : '显示释义'}
        </span>
        <span>
          <kbd>Enter</kbd> 下一轮
        </span>
      </div>

      {helpOpen && <StudyHelp onClose={() => setHelpOpen(false)} />}
    </div>
  )
}
