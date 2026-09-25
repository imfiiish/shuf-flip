import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import BackButton from '../components/BackButton'
import CardDeck, { useStageScale, type Slot } from '../components/CardDeck'
import { findWord } from '../data/words'
import { useAudioPlayer } from '../lib/audio'
import { api } from '../lib/api'
import { useWheelFlip } from '../lib/wheel'
import { useDoubleRightClick } from '../lib/rightclick'
import { logEvent } from '../lib/analytics'
import { useExitLifecycle, usePreloadWords, useWordDetails } from '../lib/session'
import {
  clearQuiz,
  loadQuiz,
  saveQuiz,
  UNDO_LIMIT,
  type QuizState,
  type Rating,
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
  const centerWord = centerName ? (findWord(centerName) ?? null) : null

  // 结束只收尾一次；期间不再回写存储
  const doneRef = useRef(false)
  /** quiz_enter 只记一次（StrictMode 下 effect 会跑两遍） */
  const enteredRef = useRef(false)

  // A1 等比缩放（舞台 1200×360）+ 底部评级条测量
  const { appRef, hintsRef, scale } = useStageScale()

  // 展开次数圆点：quiz 不展开、不显示，故不读取

  // 音频：按需播放 + 预加载本次 quiz，首次不延迟
  const play = useAudioPlayer()
  const detailsReady = useWordDetails(order)
  usePreloadWords(order, detailsReady)

  // —— 埋点：quiz_enter / quiz_card / quiz_rate / quiz_undo / quiz_exit ——
  const dirRef = useRef<'init' | 'left' | 'right'>('init')

  const beginCard = useCallback((dir: 'init' | 'left' | 'right') => {
    dirRef.current = dir
  }, [])

  const logCardLeave = useCallback(
    (name: string | null | undefined) => {
      if (!name) return
      // 词由服务器 quizzes.word_list 给出，这里只记位置
      logEvent('quiz_card', {
        quizId: quiz?.quizId ?? 0,
        slot: order.indexOf(name),
        dir: dirRef.current,
      })
    },
    [quiz, order],
  )

  useEffect(() => {
    if (!quiz) return
    if (enteredRef.current) return // StrictMode 下只记一次
    enteredRef.current = true
    logEvent('quiz_enter', {
      quizId: quiz.quizId,
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

  // 结束（评完或跳过）：上报评分 + 服务器推进一轮 + 清 quiz + 回 /study
  const finish = useCallback(
    (reason: 'done' | 'skip') => {
      if (doneRef.current) return
      doneRef.current = true
      const q = quiz
      emitExit(reason)
      if (q) {
        const list = Object.entries(ratings).map(([word, rating]) => ({
          word,
          rating,
        }))
        clearQuiz()
        // 等服务器记录评分并推进下一轮再跳；失败也跳
        const toStudy = () => navigate('/study', { replace: true })
        const advance = () =>
          void api.studyRound(q.fk, true).then(toStudy, toStudy)
        if (q.quizId > 0 && list.length > 0) {
          void api.studyQuizRatings(q.quizId, list).then(advance, advance)
        } else {
          advance()
        }
      } else {
        navigate('/study', { replace: true })
      }
    },
    [quiz, ratings, emitExit, navigate],
  )

  // 空格：只发音，不显示释义
  const playWord = useCallback(() => {
    play(centerWord?.audio)
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
        quizId: quiz?.quizId ?? 0,
        slot: order.indexOf(w),
        rating: v,
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
      quiz,
      order,
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
    logEvent('quiz_undo', {
      quizId: quiz?.quizId ?? 0,
      slot: order.indexOf(w),
      rating,
      undoLeft: nextUndo.length,
    })
  }, [undo, ratings, quiz, order, centerName, logCardLeave, beginCard])

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

  // 下一轮（跳过）的一步：第一次进入待确认，第二次确认
  // Enter / 双击右键 共用
  const skipStep = useCallback(() => {
    if (skipArmed) skip()
    else setSkipArmed(true)
  }, [skipArmed, skip])

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
        skipStep()
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
  }, [go, playWord, rate, undoLast, skipStep])

  // 双击右键（触控板双指点两次）= 按一次 Enter（第一次待确认，第二次跳过）
  useDoubleRightClick(skipStep)

  // 「跳过」按钮待确认 2.5s 后自动取消
  useEffect(() => {
    if (!skipArmed) return
    const t = setTimeout(() => setSkipArmed(false), 2500)
    return () => clearTimeout(t)
  }, [skipArmed])

  // 关页补 exit；真正卸载（比如返回主页）补一条 back（共用 useExitLifecycle）
  useExitLifecycle({
    onPageHide: () => emitExit('unload'),
    onUnmount: () => {
      if (!quiz) return // 没有真正进入 quiz（重定向中），不能发孤立的 exit
      if (doneRef.current) return // 正常结束已经记过
      emitExit('back')
    },
  })

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
