// 学习相关的持久化（IndexedDB）
// - 翻开次数：按「词」保两级 —— 当天次数（圆点用，4:00 换日归零）+ 终身总次数；
//   每天一条 revealDay 记录，历史永久保留、不搬动
// - 每本词书的位置：center（按 filterKey，一条）
import { logicalDay } from './day'
import { getKV, loadStore, put, del } from './kv'

// ---- 翻开次数 ----
type DayCounts = Record<string, number>

/** 当天（当前逻辑日）各词的翻开次数：圆点用 */
let todayDay = ''
let todayCounts: DayCounts = {}
/** 最近一次记录的逻辑日（判断是否跨天，给 counts_reset 用） */
let lastDay: string | null = null
/** word → 终身总次数 */
let totals = new Map<string, number>()

/**
 * 读取翻开次数。若存储里是旧的一天，返回已清空的当天 store，
 * 并通过 previousDay 告知调用方「发生过清零」（用于记 counts_reset 事件）。
 */
export function loadRevealStore(now: number = Date.now()): {
  store: { day: string; counts: DayCounts }
  previousDay: string | null
} {
  const today = logicalDay(now)
  const previousDay = lastDay && lastDay !== today ? lastDay : null
  if (todayDay !== today) {
    todayDay = today
    todayCounts = {}
  }
  return { store: { day: today, counts: todayCounts }, previousDay }
}

/**
 * 落盘当天次数：增量并入终身总次数（不丢历史）。
 * counts 是「当天全量」，传入即可，内部对比上一次做增量。
 */
export function saveRevealStore(store: { day: string; counts: DayCounts }): void {
  // 跨天：昨天那条 revealDay 已在库里，无需搬动；这里切到新的一天
  if (store.day !== todayDay) {
    todayDay = store.day
    todayCounts = {}
  }

  for (const [w, n] of Object.entries(store.counts)) {
    const prev = todayCounts[w] ?? 0
    if (n > prev) {
      const total = (totals.get(w) ?? 0) + (n - prev)
      totals.set(w, total)
      put('revealTotal', w, total)
    }
  }

  todayCounts = { ...store.counts }
  put('revealDay', todayDay, todayCounts)
  if (lastDay !== todayDay) {
    lastDay = todayDay
    put('misc', 'revealLast', todayDay)
  }
}

// ---- 位置（按 filterKey）----
// 值里带本轮 deck 的签名：只有 deck 一致才恢复 center
type CenterEntry = { deck: string; center: number }

function isCenterEntry(v: unknown): v is CenterEntry {
  if (typeof v !== 'object' || v === null) return false
  const o = v as { deck?: unknown; center?: unknown }
  return (
    typeof o.deck === 'string' &&
    Number.isInteger(o.center) &&
    (o.center as number) >= 0
  )
}

let centers = new Map<string, CenterEntry>()

/** 读本轮位置；存的 deck 与当前不一致则视为 0 */
export function loadCenter(key: string, deck: string): number {
  const e = centers.get(key)
  return e && e.deck === deck ? e.center : 0
}

export function saveCenter(key: string, deck: string, center: number): void {
  if (center > 0) {
    centers.set(key, { deck, center })
    put('centers', key, { deck, center })
  } else {
    if (!centers.has(key)) return
    centers.delete(key)
    del('centers', key)
  }
}

export async function hydrateProgress(): Promise<void> {
  const today = logicalDay()

  const rawTotals = await loadStore('revealTotal')
  totals = new Map()
  for (const [w, n] of Object.entries(rawTotals)) {
    if (typeof n === 'number') totals.set(w, n)
  }

  const last = await getKV<string>('misc', 'revealLast')
  lastDay = typeof last === 'string' ? last : null

  const day = await getKV<DayCounts>('revealDay', today)
  todayDay = today
  todayCounts = day && typeof day === 'object' ? { ...day } : {}

  const rawCenters = await loadStore('centers')
  centers = new Map()
  for (const [k, v] of Object.entries(rawCenters)) {
    if (isCenterEntry(v)) centers.set(k, v)
  }
}
