// 学习相关的持久化
// - 展开次数（全局，所有词书互通）：按逻辑日（本地 04:00 换日）分桶，跨天清零
// - 每本词书/每一轮的位置：center（按 key 分开）
import { readMap, readJSON, writeJSON } from './storage'
import { logicalDay } from './day'

const REVEAL_KEY = 'vocab-reveal-counts'
const CENTERS_KEY = 'vocab-centers'

function isIndex(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= 0
}

function isCount(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) > 0
}

// ---- 展开次数（按逻辑日）----
export type RevealStore = {
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

// ---- 位置（按 key 分开）----
function loadCenterMap(): Record<string, number> {
  return readMap<number>(CENTERS_KEY, isIndex)
}

export function loadCenter(key: string): number {
  return loadCenterMap()[key] ?? 0
}

export function saveCenter(key: string, center: number): void {
  const map = loadCenterMap()
  if (center > 0) map[key] = center
  else delete map[key]
  writeJSON(CENTERS_KEY, map)
}
