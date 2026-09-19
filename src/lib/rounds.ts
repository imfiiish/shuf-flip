// 每轮的顺序（按词书）：这是「本轮是哪 20 个」的唯一来源。
// 存 word 字符串（不是数组下标），词库增删/重排都不会错位。
import { readMap, writeJSON } from './storage'

/** 每轮推送的词数 */
export const ROUND_SIZE = 20

/** 洗牌：返回打乱顺序的新数组 */
function shuffle<T>(pool: readonly T[]): T[] {
  const arr = [...pool]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = arr[i]
    arr[i] = arr[j]
    arr[j] = t
  }
  return arr
}

/** 开新的一轮：洗整本词书，返回完整顺序和本轮（前 ROUND_SIZE 个） */
export function drawRound(pool: readonly string[]): {
  order: string[]
  round: string[]
} {
  const order = shuffle(pool)
  return { order, round: order.slice(0, ROUND_SIZE) }
}

/**
 * 用当前词池校准已存顺序：保留仍存在的词（保持原顺序），新词按池顺序追加到末尾。
 * 词库增删 / 改 tag 时不再整池重洗，当前这一轮基本不动。
 * 没存过、或与池完全没有交集 → 当作新的一轮（整池洗牌）。
 */
export function fitOrder(
  stored: readonly string[] | null,
  pool: readonly string[],
): string[] {
  const poolSet = new Set(pool)
  const kept: string[] = []
  const seen = new Set<string>()
  for (const w of stored ?? []) {
    if (poolSet.has(w) && !seen.has(w)) {
      seen.add(w)
      kept.push(w)
    }
  }
  if (kept.length === 0) return shuffle(pool)
  for (const w of pool) if (!seen.has(w)) kept.push(w)
  return kept
}

const ORDERS_KEY = 'vocab-round-orders'

function isWordArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

function loadOrders(): Record<string, string[]> {
  return readMap<string[]>(ORDERS_KEY, isWordArray)
}

/** 某本词书上一轮的随机顺序（没有则 null） */
export function loadOrder(key: string): string[] | null {
  return loadOrders()[key] ?? null
}

export function saveOrder(key: string, order: string[]): void {
  const map = loadOrders()
  map[key] = order
  writeJSON(ORDERS_KEY, map)
}
