// Quiz（每 8 轮一次的自测）
//
// 学完 8 轮、活跃窗口即将换新前，服务器从「这 8 轮里 met 过的词」（待考池）
// 随机抽至多 16 个（见 server /api/study/quiz），客户端逐个打 1/2/3。
// 本地只存 UI 状态（题目、评分、撤销栈、位置），刷新可续。
//
// 「是否待做 quiz」以本模块存的 QuizState 是否存在为准：
//  - Study 到达边界时先向服务器要题（startQuiz 落盘）再跳 /quiz
//  - /study 挂载时若存在 QuizState → 重定向到 /quiz
//  - /quiz 挂载时若不存在 QuizState → 重定向到 /study
import { getKV, put, del } from './kv'
import { isStringArray } from './guard'
import type { Accent } from './i18n'

/** quiz 三档：1 陌生 / 2 模糊 / 3 熟悉 */
export type Rating = 1 | 2 | 3

export function isRating(v: unknown): v is Rating {
  return v === 1 || v === 2 || v === 3
}

/** Ctrl+Z 撤销栈深度：最多连续撤 3 次 */
export const UNDO_LIMIT = 3

export type QuizState = {
  /** 服务器签发的 quiz id（0 = 旧数据，缺失） */
  quizId: number
  /** 目标词书的筛选键 */
  filterKey: string
  /** 目标词书的中文口音（普通话/粤语）；旧数据缺失视为普通话 */
  accent?: Accent
  /** 触发时的轮序号（8/16/24…） */
  roundSeq: number
  /** 本次 quiz 的词（已洗牌，顺序固定） */
  words: string[]
  /** word → 评分（未评 = 不在 map 里） */
  ratings: Record<string, Rating>
  /** 撤销栈：最早 → 最近（末尾 = 最近一次评分） */
  undo: string[]
  /** 当前中心词在「未评列表 remaining」里的下标 */
  center: number
}

function parseQuiz(v: unknown): QuizState | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (typeof o.filterKey !== 'string' || typeof o.roundSeq !== 'number') {
    return null
  }
  if (!isStringArray(o.words) || !isStringArray(o.undo)) return null
  if (typeof o.ratings !== 'object' || o.ratings === null) return null
  const ratings: Record<string, Rating> = {}
  for (const [k, val] of Object.entries(o.ratings)) {
    if (isRating(val)) ratings[k] = val
  }
  const center =
    typeof o.center === 'number' && Number.isInteger(o.center) && o.center >= 0
      ? o.center
      : 0
  return {
    quizId: Number.isInteger(o.quizId) ? (o.quizId as number) : 0,
    filterKey: o.filterKey,
    accent: o.accent === 'hk' ? 'hk' : 'cn',
    roundSeq: o.roundSeq,
    words: o.words,
    ratings,
    undo: o.undo,
    center,
  }
}

/** 当前待做的 quiz（内存） */
let cache: QuizState | null = null

/** 读当前待做的 quiz（没有 = null） */
export function loadQuiz(): QuizState | null {
  return cache
}

export function saveQuiz(state: QuizState): void {
  cache = state
  put('misc', 'quiz', state)
}

export function clearQuiz(): void {
  cache = null
  del('misc', 'quiz')
}

export async function hydrateQuiz(): Promise<void> {
  const raw = await getKV<unknown>('misc', 'quiz')
  cache = raw == null ? null : parseQuiz(raw)
}

/**
 * 用服务器发来的题目建立本地 quiz 状态（题目由服务器从待考池抽）。
 * 已存在则不覆盖（续做）。
 */
export function startQuiz(
  filterKey: string,
  roundSeq: number,
  quizId: number,
  words: string[],
  accent: Accent = 'cn',
): QuizState {
  const existing = loadQuiz()
  if (existing) return existing
  const state: QuizState = {
    quizId,
    filterKey,
    accent,
    roundSeq,
    words,
    ratings: {},
    undo: [],
    center: 0,
  }
  saveQuiz(state)
  return state
}
