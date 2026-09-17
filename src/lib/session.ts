// 当前学习会话：从词书弹窗里选中的那一组词
import { readJSON, writeJSON } from './storage'

export type Session = {
  /** 所属词书的 filterKey */
  key: string
  /** 这一组要学的词索引（words 原始索引） */
  indices: number[]
}

const KEY = 'vocab-session'

export function loadSession(): Session | null {
  return readJSON<Session>(KEY, (v) => {
    if (typeof v !== 'object' || v === null) return null
    const s = v as { key?: unknown; indices?: unknown }
    if (typeof s.key !== 'string' || !Array.isArray(s.indices)) return null
    const indices = s.indices.filter(
      (x): x is number => Number.isInteger(x) && x >= 0,
    )
    if (indices.length === 0) return null
    return { key: s.key, indices }
  })
}

export function saveSession(s: Session): void {
  writeJSON(KEY, s)
}
