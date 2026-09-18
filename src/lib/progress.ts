// 学习相关的持久化
// - 展开次数（全局，所有词书互通）：key = word 字符串
// - 每本词书/每一轮的位置：center（按 key 分开）
import { readMap, writeJSON } from './storage'

const REVEAL_KEY = 'vocab-reveal-counts'
const CENTERS_KEY = 'vocab-centers'

function isIndex(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= 0
}

function isCount(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) > 0
}

// ---- 展开次数（全局）----
export function loadRevealCounts(): Record<string, number> {
  return readMap<number>(REVEAL_KEY, isCount)
}

export function saveRevealCounts(counts: Record<string, number>): void {
  writeJSON(REVEAL_KEY, counts)
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
