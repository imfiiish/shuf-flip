// 学习相关的持久化
// - 展开次数（全局，所有词书互通）：按逻辑日（本地 04:00 换日）分桶，跨天清零
// - 每本词书的位置：center（每个 filterKey 只保一条当前 deck 的记录）
import { readMap, readJSON, writeJSON } from './storage'
import { logicalDay } from './day'

const REVEAL_KEY = 'vocab-reveal-counts'
const CENTERS_KEY = 'vocab-centers'

function isCount(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) > 0
}

// ---- 展开次数（按逻辑日）----
type RevealStore = {
  /** 逻辑日 YYYY-MM-DD */
  day: string
  /** word 字符串 → 当天展开次数 */
  counts: Record<string, number>
}

/**
 * 读取展开次数。若存储里是旧的一天（或旧格式），返回已清空的当天 store，
 * 并通过 previousDay 告知调用方「发生过清零」（用于记 counts_reset 事件）。
 */
export function loadRevealStore(now: number = Date.now()): {
  store: RevealStore
  previousDay: string | null
} {
  const today = logicalDay(now)
  const raw = readJSON<RevealStore>(REVEAL_KEY, (v) => {
    if (typeof v !== 'object' || v === null) return null
    const o = v as { day?: unknown; counts?: unknown }
    if (typeof o.day !== 'string') return null
    if (typeof o.counts !== 'object' || o.counts === null) return null
    const counts: Record<string, number> = {}
    for (const [k, val] of Object.entries(o.counts)) {
      if (isCount(val)) counts[k] = val
    }
    return { day: o.day, counts }
  })

  if (!raw) return { store: { day: today, counts: {} }, previousDay: null }
  if (raw.day !== today) {
    return { store: { day: today, counts: {} }, previousDay: raw.day }
  }
  return { store: raw, previousDay: null }
}

export function saveRevealStore(store: RevealStore): void {
  writeJSON(REVEAL_KEY, store)
}

// ---- 位置（按 filterKey）----
// 值里带本轮 deck 的签名：只有 deck 一致才恢复 center；每个 key 只留当前一条，
// 避免每轮换新 deck 就新增一条、无限增长（也就不会每次翻卡都解析一个越来越大的 map）
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

function loadCenterMap(): Record<string, CenterEntry> {
  return readMap<CenterEntry>(CENTERS_KEY, isCenterEntry)
}

/** 读本轮位置；存的 deck 与当前不一致则视为 0 */
export function loadCenter(key: string, deck: string): number {
  const e = loadCenterMap()[key]
  return e && e.deck === deck ? e.center : 0
}

export function saveCenter(key: string, deck: string, center: number): void {
  const map = loadCenterMap()
  if (center > 0) map[key] = { deck, center }
  else delete map[key]
  writeJSON(CENTERS_KEY, map)
}
