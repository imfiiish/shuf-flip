import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import BackButton from '../components/BackButton'
import CardDeck, { useStageScale, type Slot } from '../components/CardDeck'
import { getWord } from '../lib/dict'
import { preloadAudio, useAudioPlayer } from '../lib/audio'
import { advance, loadCascade, saveCascade } from '../lib/cascade'
import { poolOf } from '../lib/filter'
import { useWheelFlip } from '../lib/wheel'
import { logEvent, flushBeacon } from '../lib/analytics'
import {
  clearQuiz,
  loadQuiz,
  saveQuiz,
  UNDO_LIMIT,
  type Rating,
  type QuizState,
} from '../lib/quiz'

/**
 * 自测页：与 Study 同一套卡片舞台，但只「考」不「示」——空格只发音，不显示释义；
 * 底部是 1 陌生 / 2 模糊 / 3 熟悉。每评一个词就从牌堆移除；
 * Ctrl+Z 可撤回最近 3 次评分（还原该词并居中）。全部评完或跳过后推进级联一轮回 /study。
 */
export default function Quiz() {
  const navigate = useNavigate()

  // 初始 quiz 只读一次（不存在则下面重定向到 /study）
  const initRef = useRef<QuizState | null | undefined>(undefined)
  if (initRef.current === undefined) initRef.current = loadQuiz()
  const quiz = initRef.current

  const order = useMemo(() => quiz?.words ?? [], [quiz])

  const [ratings, setRatings] = useState<Record<string, Rating>>(
    () => quiz?.ratings ?? {},
  )
  const [undo, setUndo] = useState<string[]>(() => quiz?.undo ?? [])
  // 右下角「跳过」按钮 / Enter：两次确认（第一次进入待确认，2.5s 自动取消）
  const [skipArmed, setSkipArmed] = useState(false)

  // 未评的词（保持原顺序）；已评的下标会移动
  const remaining = useMemo(
    () => order.filter((w) => !(w in ratings)),
    [order, ratings],
  )
  const [center, setCenter] = useState(() => quiz?.center ?? 0)
  const safeCenter = remaining.length
    ? Math.min(center, remaining.length - 1)
    : 0
  const centerName: string | null = remaining[safeCenter] ?? null
  const centerWord = centerName ? (getWord(centerName) ?? null) : null

  // 结束只收尾一次；期间不再回写存储
  const doneRef = useRef(false)
  /** quiz_enter 只记一次（StrictMode 下 effect 会跑两遍） */
  const enteredRef = useRef(false)

  // A1 等比缩放（舞台 1200×360）+ 底部评级条测量
  const { appRef, hintsRef, scale } = useStageScale()

  // 展开次数圆点：quiz 不展开、不显示，故不读取

  // 音频：按需播放 + 预加载本次 quiz，首次不延迟
  const play = useAudioPlayer()
  useEffect(() => {
    if (!quiz) return
    preloadAudio(
      quiz.words.flatMap((name) => {
        const w = getWord(name)
        return w ? [w.audio_file] : []
      }),
    )
  }, [quiz])

  // —— 埋点：quiz_enter / quiz_card / quiz_rate / quiz_undo / quiz_exit ——
  const viewStartRef = useRef(performance.now())
  const dirRef = useRef<'init' | 'left' | 'right'>('init')
  /** 当前这张卡按了几次空格（发音） */
  const playsRef = useRef(0)

  const beginCard = useCallback((dir: 'init' | 'left' | 'right') => {
    viewStartRef.current = performance.now()
    dirRef.current = dir
    playsRef.current = 0
  }, [])

  const logCardLeave = useCallback((name: string | null | undefined) => {
    if (!name) return
    logEvent('quiz_card', {
      word: name,
      dir: dirRef.current,
      dwellMs: Math.max(0, Math.round(performance.now() - viewStartRef.current)),
      plays: playsRef.current,
    })
  }, [])

  useEffect(() => {
    if (!quiz) return
    if (enteredRef.current) return // StrictMode 下只记一次
    enteredRef.current = true
    logEvent('quiz_enter', {
      fk: quiz.fk,
      batch: quiz.batch,
      total: quiz.words.length,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 持久化：评分 / 撤销栈 / center 变化即落盘（刷新或返回后重进可续）
  useEffect(() => {
    if (doneRef.current || !quiz) return
    saveQuiz({ ...quiz, ratings, undo, center })
  }, [quiz, ratings, undo, center])

  // 结束/离开：一次只发一条 quiz_exit（补上「返回主页」「关页」的情况）
  const aliveRef = useRef(true)
  const exitSentRef = useRef(false)
  const statsRef = useRef({ rated: 0, total: 0 })
  statsRef.current = { rated: Object.keys(ratings).length, total: order.length }
  const emitExit = useCallback(
    (reason: 'done' | 'skip' | 'back' | 'unload') => {
      if (exitSentRef.current) return
      exitSentRef.current = true
      logEvent('quiz_exit', { reason, ...statsRef.current })
    },
    [],
  )

  // 结束（评完或跳过）：推进级联一轮 + 清 quiz + 回 /study
  const finish = useCallback(
    (reason: 'done' | 'skip') => {
      if (doneRef.current) return
      doneRef.current = true
      if (quiz) {
        const c = loadCascade(quiz.fk)
        // 只在批次一致时推进，避免重复/错位 advance
        if (c && c.r === quiz.batch) {
          saveCascade(quiz.fk, advance(c, poolOf(quiz.filter)))
        }
        clearQuiz()
      }
      emitExit(reason)
      navigate('/study', { replace: true })
    },
    [quiz, emitExit, navigate],
  )

  // 空格：只发音，不显示释义
  const playWord = useCallback(() => {
    playsRef.current += 1
    play(centerWord?.audio_file)
  }, [play, centerWord])

  // 评分：移除该词，自动滑到下一张未评卡
  const rate = useCallback(
    (v: Rating) => {
      const w = remaining[safeCenter]
      if (!w) return
      logCardLeave(w)
      const nextRatings = { ...ratings, [w]: v }
      const nextUndo = [...undo, w].slice(-UNDO_LIMIT)
      setRatings(nextRatings)
      setUndo(nextUndo)
      setSkipArmed(false)
      logEvent('quiz_rate', {
        word: w,
        rating: v,
        plays: playsRef.current,
        left: remaining.length - 1,
      })
      const newLen = remaining.length - 1
      if (newLen <= 0) {
        finish('done')
        return
      }
      setCenter((c) => (c >= newLen ? 0 : c))
      beginCard('right')
    },
    [
      remaining,
      safeCenter,
      ratings,
      undo,
      logCardLeave,
      finish,
      beginCard,
    ],
  )

  // Ctrl+Z：撤回最近一次评分该词，还原并居中（最多连续 3 次）
  const undoLast = useCallback(() => {
    if (undo.length === 0) return
    const w = undo[undo.length - 1]
    const nextUndo = undo.slice(0, -1)
    const nextRatings = { ...ratings }
    const rating = nextRatings[w]
    delete nextRatings[w]
    logCardLeave(centerName)
    setUndo(nextUndo)
    setRatings(nextRatings)
    setSkipArmed(false)
    const newRemaining = order.filter((x) => !(x in nextRatings))
    const idx = newRemaining.indexOf(w)
    setCenter(idx >= 0 ? idx : 0)
    beginCard('left')
    logEvent('quiz_undo', { word: w, rating, undoLeft: nextUndo.length })
  }, [undo, ratings, order, centerName, logCardLeave, beginCard])

  // 翻卡：只在未评的词之间移动
  const go = useCallback(
    (delta: number) => {
      if (remaining.length === 0) return
      logCardLeave(centerName)
      setSkipArmed(false)
      setCenter((c) => (c + delta + remaining.length) % remaining.length)
      beginCard(delta > 0 ? 'right' : 'left')
    },
    [remaining.length, centerName, logCardLeave, beginCard],
  )

  // 滚轮翻卡
  useWheelFlip(go)

  // 跳过 = 结束（Enter 或右下角按钮，均两次确认）
  const skip = useCallback(() => {
    logCardLeave(centerName)
    finish('skip')
  }, [centerName, logCardLeave, finish])

  // 键盘：Space 发音 / H L 翻卡 / 1 2 3 评分 / Ctrl+Z 撤销 / Enter×2 跳过
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = e.key

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && k.toLowerCase() === 'z') {
        e.preventDefault()
        undoLast()
        return
      }
      if (k === ' ') {
        e.preventDefault()
        if (e.repeat) return // 按住时忽略自动重复，避免疯狂重播
        playWord()
        return
      }
      if (k === 'Enter') {
        e.preventDefault()
        if (e.repeat) return
        if (skipArmed) skip()
        else setSkipArmed(true)
        return
      }
      setSkipArmed(false)
      if (k === '1' || k === '2' || k === '3') {
        e.preventDefault()
        rate(Number(k) as Rating)
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
  }, [go, playWord, rate, undoLast, skip, skipArmed])

  // 「跳过」按钮待确认 2.5s 后自动取消
  useEffect(() => {
    if (!skipArmed) return
    const t = setTimeout(() => setSkipArmed(false), 2500)
    return () => clearTimeout(t)
  }, [skipArmed])

  // 关页/刷新：补一条 quiz_exit 并立即发出
  useEffect(() => {
    const onPageHide = () => {
      emitExit('unload')
      flushBeacon()
    }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [emitExit])

  // 真正离开 Quiz 页（比如点返回主页）时补一条 quiz_exit（微任务区分 StrictMode 假卸载）
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      if (!quiz) return // 没有真正进入 quiz（重定向中），不能发孤立的 exit
      if (doneRef.current) return // 正常结束已经记过
      queueMicrotask(() => {
        if (!aliveRef.current) emitExit('back')
      })
    }
  }, [emitExit, quiz])

  // 意外情况：进来时已经全部评完（比如上一步完成后刷新），直接推进收尾
  const finishRef = useRef(finish)
  finishRef.current = finish
  useEffect(() => {
    if (quiz && remaining.length === 0 && !doneRef.current) {
      finishRef.current('done')
    }
  }, [quiz, remaining.length])

  // 没有待做 quiz → 回 /study（互斥重定向）
  if (!quiz) return <Navigate to="/study" replace />

  const onCardClick = (_name: string, slot: Slot) => {
    if (slot === 0) playWord()
    else if (slot === 1 || slot === 'S') go(1)
    else if (slot === -1) go(-1)
  }

  return (
    <div className="app" ref={appRef}>
      {/* 返回主页（与 Study 一致；不会跳过 quiz） */}
      <BackButton to="/" label="返回主页" />

      {/* 右下角：跳过（与 Study 的「下一轮」镜像对称），需点两次确认 */}
      <button
        type="button"
        className={`icon-btn next-round-btn skip-btn${skipArmed ? ' armed' : ''}`}
        onClick={() => {
          if (skipArmed) skip()
          else setSkipArmed(true)
        }}
        aria-label={skipArmed ? '再点一次确认跳过' : '跳过测验'}
        title={skipArmed ? '再点一次确认跳过' : '跳过测验'}
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
          <polyline points="6 6 12 12 6 18" />
          <polyline points="13 6 19 12 13 18" />
        </svg>
      </button>

      <CardDeck
        deck={remaining}
        center={safeCenter}
        scale={scale}
        onCardClick={onCardClick}
      />

      <div className="hints" ref={hintsRef}>
        <div className="quiz-ratings">
          <button
            type="button"
            className="rating-btn r"
            onClick={(e) => {
              e.currentTarget.blur()
              rate(1)
            }}
          >
            <kbd>1</kbd> 陌生
          </button>
          <button
            type="button"
            className="rating-btn y"
            onClick={(e) => {
              e.currentTarget.blur()
              rate(2)
            }}
          >
            <kbd>2</kbd> 模糊
          </button>
          <button
            type="button"
            className="rating-btn g"
            onClick={(e) => {
              e.currentTarget.blur()
              rate(3)
            }}
          >
            <kbd>3</kbd> 熟悉
          </button>
        </div>
      </div>
    </div>
  )
}
