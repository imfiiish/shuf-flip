// 学习相关的持久化（目前只有「展开释义次数」）
const REVEAL_KEY = 'vocab-reveal-counts'

/** 每个词「展开释义」的次数，key 是 words 里的原始索引 */
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
