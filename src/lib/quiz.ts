// Quiz（每 WINDOW_ROUNDS 轮一次的自测）
//
// 学完 8 轮、活跃窗口即将换新前，从「刚学完的那 64 词窗口」随机抽 16 个词，
// 逐个打 1/2/3（陌生/模糊/熟悉）。状态持久化，刷新可续；结束/跳过后推进级联。
//
// 「是否待做 quiz」以本模块存的 QuizState 是否存在为准：
//  - Study 到达 quiz 边界时先 armQuiz（抽词落盘）再跳 /quiz
//  - /study 挂载时若存在 QuizState → 重定向到 /quiz
//  - /quiz 挂载时若不存在 QuizState → 重定向到 /study
import { getKV, put, del } from './kv'
import { pick } from './random'
import { isStringArray } from './guard'

/** 每份 quiz 抽取的词数 */
const QUIZ_SIZE = 16

/** Ctrl+Z 撤销栈深度：最多连续撤 3 次 */
export const UNDO_LIMIT = 3

/** 1 陌生 / 2 模糊 / 3 熟悉 */
export type Rating = 1 | 2 | 3

export type QuizState = {
  /** 目标词书（filterKey） */
  fk: string
  /** 触发时的 cascade.r（批次：8/16/24…） */
  batch: number
  /** 本次 quiz 的词（已洗牌，顺序固定） */
  words: string[]
  /** word → 评分（未评 = 不在 map 里） */
  ratings: Record<string, Rating>
  /** 撤销栈：最早 → 最近（末尾 = 最近一次评分） */
  undo: string[]
  /** 当前中心词在「未评列表 remaining」里的下标 */
  center: number
}

function isRating(v: unknown): v is Rating {
  return v === 1 || v === 2 || v === 3
}

function parseQuiz(v: unknown): QuizState | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (typeof o.fk !== 'string' || typeof o.batch !== 'number') return null
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
    fk: o.fk,
    batch: o.batch,
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
 * 从活跃窗口抽词并落盘（Study 到达边界时调用）。已存在则不覆盖。
 * 返回当前生效的 QuizState。
 */
export function armQuiz(
  fk: string,
  windowWords: readonly string[],
  batch: number,
): QuizState {
  const existing = loadQuiz()
  if (existing) return existing
  const state: QuizState = {
    fk,
    batch,
    words: pick(windowWords, QUIZ_SIZE),
    ratings: {},
    undo: [],
    center: 0,
  }
  saveQuiz(state)
  return state
}
