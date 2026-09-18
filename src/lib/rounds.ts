// 词书弹窗偏好：每轮的随机顺序（按词书）
import { readMap, writeJSON } from './storage'

/** 每轮推送的词数 */
export const ROUND_SIZE = 20

/** 洗牌：返回打乱顺序的新数组 */
export function shuffle(pool: number[]): number[] {
  const arr = [...pool]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = arr[i]
    arr[i] = arr[j]
    arr[j] = t
  }
  return arr
}

/** 换一轮：洗整本词书，返回完整顺序和本轮（前 ROUND_SIZE 个） */
export function drawRound(pool: number[]): {
  order: number[]
  round: number[]
} {
  const order = shuffle(pool)
  return { order, round: order.slice(0, ROUND_SIZE) }
}

const ORDERS_KEY = 'vocab-round-orders'

function isIndexArray(v: unknown): v is number[] {
  return (
    Array.isArray(v) && v.every((x) => Number.isInteger(x) && (x as number) >= 0)
  )
}

function loadOrders(): Record<string, number[]> {
  return readMap<number[]>(ORDERS_KEY, isIndexArray)
}

/** 某本词书上一轮的随机顺序（没有则 null） */
export function loadOrder(key: string): number[] | null {
  return loadOrders()[key] ?? null
}

export function saveOrder(key: string, order: number[]): void {
  const map = loadOrders()
  map[key] = order
  writeJSON(ORDERS_KEY, map)
}
