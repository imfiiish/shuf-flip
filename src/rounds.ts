// 词书弹窗偏好：每轮的随机顺序（按词书）+ 每轮词数
const SIZE_KEY = 'vocab-round-size'
const ORDERS_KEY = 'vocab-round-orders'

export const ROUND_SIZES = [5, 10, 20]

export function loadRoundSize(): number {
  const n = Number(localStorage.getItem(SIZE_KEY))
  return ROUND_SIZES.includes(n) ? n : 10
}

export function saveRoundSize(n: number): void {
  localStorage.setItem(SIZE_KEY, String(n))
}

function isIndexArray(v: unknown): v is number[] {
  return (
    Array.isArray(v) && v.every((x) => Number.isInteger(x) && (x as number) >= 0)
  )
}

function loadOrders(): Record<string, number[]> {
  try {
    const raw = localStorage.getItem(ORDERS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, number[]> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (isIndexArray(v)) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

/** 某本词书上一轮的随机顺序（没有则 null） */
export function loadOrder(key: string): number[] | null {
  return loadOrders()[key] ?? null
}

export function saveOrder(key: string, order: number[]): void {
  const map = loadOrders()
  map[key] = order
  localStorage.setItem(ORDERS_KEY, JSON.stringify(map))
}
