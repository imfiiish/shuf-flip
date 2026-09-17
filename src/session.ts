// 当前学习会话：从词书弹窗里选中的那一组词
export type Session = {
  /** 所属词书的 filterKey */
  key: string
  /** 这一组要学的词索引（words 原始索引） */
  indices: number[]
}

const KEY = 'vocab-session'

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as { key?: unknown; indices?: unknown }
    if (typeof s?.key !== 'string' || !Array.isArray(s.indices)) return null
    const indices = s.indices.filter(
      (x): x is number => Number.isInteger(x) && x >= 0,
    )
    if (indices.length === 0) return null
    return { key: s.key, indices }
  } catch {
    return null
  }
}

export function saveSession(s: Session): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}
