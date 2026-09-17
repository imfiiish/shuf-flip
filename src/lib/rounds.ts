// 词书弹窗偏好：每轮的随机顺序（按词书）
import { readJSON, writeJSON } from './storage'

const ORDERS_KEY = 'vocab-round-orders'

function isIndexArray(v: unknown): v is number[] {
  return (
    Array.isArray(v) && v.every((x) => Number.isInteger(x) && (x as number) >= 0)
  )
}

function loadOrders(): Record<string, number[]> {
  return (
    readJSON<Record<string, number[]>>(ORDERS_KEY, (v) => {
      if (typeof v !== 'object' || v === null) return {}
      const out: Record<string, number[]> = {}
      for (const [k, val] of Object.entries(v)) {
        if (isIndexArray(val)) out[k] = val
      }
      return out
    }) ?? {}
  )
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
