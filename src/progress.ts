// 学习相关的持久化
// - 展开次数（全局，所有词书互通）
// - 每本词书/每一轮的位置：center（按 key 分开）

const REVEAL_KEY = 'vocab-reveal-counts'
const CENTERS_KEY = 'vocab-centers'

function isIndex(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= 0
}

// ---- 展开次数（全局，key = words 原始索引）----
export function loadRevealCounts(): Record<number, number> {
  try {
    const raw = localStorage.getItem(REVEAL_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<number, number> = {}
    for (const [k, v] of Object.entries(parsed)) {
      const idx = Number(k)
      if (Number.isInteger(idx) && idx >= 0 && typeof v === 'number' && v > 0) {
        out[idx] = v
      }
    }
    return out
  } catch {
    return {}
  }
}

export function saveRevealCounts(counts: Record<number, number>): void {
  localStorage.setItem(REVEAL_KEY, JSON.stringify(counts))
}

// ---- 位置（按 key 分开）----
function loadCenterMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(CENTERS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (isIndex(v)) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export function loadCenter(key: string): number {
  return loadCenterMap()[key] ?? 0
}

export function saveCenter(key: string, center: number): void {
  const map = loadCenterMap()
  if (center > 0) map[key] = center
  else delete map[key]
  localStorage.setItem(CENTERS_KEY, JSON.stringify(map))
}
