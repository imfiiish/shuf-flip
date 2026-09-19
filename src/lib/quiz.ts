// Quiz（每 WINDOW_ROUNDS 轮一次的自测）
//
// 学完 8 轮、活跃窗口即将换新前，从「刚学完的那 64 词窗口」随机抽 16 个词，
// 逐个打 1/2/3（陌生/模糊/熟悉）。状态持久化，刷新可续；结束/跳过后推进级联。
//
// 「是否待做 quiz」以本模块存的 QuizState 是否存在为准：
//  - Study 到达 quiz 边界时先 armQuiz（抽词落盘）再跳 /quiz
//  - /study 挂载时若存在 QuizState → 重定向到 /quiz
//  - /quiz 挂载时若不存在 QuizState → 重定向到 /study
import type { TagFilter } from './filter'
import { readJSON, removeItem, writeJSON } from './storage'

/** 每份 quiz 抽取的词数 */
export const QUIZ_SIZE = 16

/** Ctrl+Z 撤销栈深度：最多连续撤 3 次 */
export const UNDO_LIMIT = 3

/** 1 陌生 / 2 模糊 / 3 熟悉 */
export type Rating = 1 | 2 | 3

export type QuizState = {
  /** 目标词书（filterKey） */
  fk: string
  /** 触发时的 cascade.r（批次：8/16/24…） */
  batch: number
  /** 抽词所用的筛选，结束时用它还原词池 */
  filter: TagFilter
  /** 本次 quiz 的词（已洗牌，顺序固定） */
  words: string[]
  /** word → 评分（未评 = 不在 map 里） */
  ratings: Record<string, Rating>
  /** 撤销栈：最早 → 最近（末尾 = 最近一次评分） */
  undo: string[]
  /** 当前中心词在「未评列表 remaining」里的下标 */
  center: number
}

const KEY = 'vocab-quiz'

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

function isRating(v: unknown): v is Rating {
  return v === 1 || v === 2 || v === 3
}

function isFilter(v: unknown): v is TagFilter {
  if (typeof v !== 'object' || v === null) return false
  const f = v as { include?: unknown; exclude?: unknown }
  return isStringArray(f.include) && isStringArray(f.exclude)
}

function parseQuiz(v: unknown): QuizState | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (typeof o.fk !== 'string' || typeof o.batch !== 'number') return null
  if (!isFilter(o.filter)) return null
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
    filter: o.filter,
    words: o.words,
    ratings,
    undo: o.undo,
    center,
  }
}

/** 读当前待做的 quiz（没有 = null） */
export function loadQuiz(): QuizState | null {
  return readJSON<QuizState>(KEY, parseQuiz)
}

export function saveQuiz(state: QuizState): void {
  writeJSON(KEY, state)
}

export function clearQuiz(): void {
  removeItem(KEY)
}

/** 洗牌取前 k 个 */
function pick(pool: readonly string[], k: number): string[] {
  const a = [...pool]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a.slice(0, Math.max(0, Math.min(k, a.length)))
}

/**
 * 从活跃窗口抽词并落盘（Study 到达边界时调用）。已存在则不覆盖。
 * 返回当前生效的 QuizState。
 */
export function armQuiz(
  fk: string,
  filter: TagFilter,
  windowWords: readonly string[],
  batch: number,
): QuizState {
  const existing = loadQuiz()
  if (existing) return existing
  const state: QuizState = {
    fk,
    batch,
    filter: { include: [...filter.include], exclude: [...filter.exclude] },
    words: pick(windowWords, QUIZ_SIZE),
    ratings: {},
    undo: [],
    center: 0,
  }
  saveQuiz(state)
  return state
}
