// 学习相关的持久化
// - 展开次数（全局，所有词书互通）
// - 每本词书/每一轮的位置：center（按 key 分开）
import { readJSON, writeJSON } from './storage'

const REVEAL_KEY = 'vocab-reveal-counts'
const CENTERS_KEY = 'vocab-centers'

function isIndex(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= 0
}

// ---- 展开次数（全局，key = words 原始索引）----
export function loadRevealCounts(): Record<number, number> {
  return (
    readJSON<Record<number, number>>(REVEAL_KEY, (v) => {
      if (typeof v !== 'object' || v === null) return {}
      const out: Record<number, number> = {}
      for (const [k, val] of Object.entries(v)) {
        const idx = Number(k)
        if (
          Number.isInteger(idx) &&
          idx >= 0 &&
          typeof val === 'number' &&
          val > 0
        ) {
          out[idx] = val
        }
      }
      return out
    }) ?? {}
  )
}

export function saveRevealCounts(counts: Record<number, number>): void {
  writeJSON(REVEAL_KEY, counts)
}

// ---- 位置（按 key 分开）----
function loadCenterMap(): Record<string, number> {
  return (
    readJSON<Record<string, number>>(CENTERS_KEY, (v) => {
      if (typeof v !== 'object' || v === null) return {}
      const out: Record<string, number> = {}
      for (const [k, val] of Object.entries(v)) {
        if (isIndex(val)) out[k] = val
      }
      return out
    }) ?? {}
  )
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
