// 学习相关的持久化
// - 词汇状态（全局，所有词书互通）：展开次数、已完成
// - 每本词书的位置：center（按 filterKey 分开）

const REVEAL_KEY = 'vocab-reveal-counts'
const COMPLETED_KEY = 'vocab-completed'
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

// ---- 已完成（全局，词索引；任意词书完成即全局完成）----
export function loadCompleted(): number[] {
  try {
    const raw = localStorage.getItem(COMPLETED_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isIndex) : []
  } catch {
    return []
  }
}

export function saveCompleted(indices: number[]): void {
  localStorage.setItem(COMPLETED_KEY, JSON.stringify(indices))
}

// ---- 每本词书的位置（按 filterKey 分开）----
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
