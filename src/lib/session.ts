// 当前学习会话：从词书弹窗里选中的那一组词
// 存 word 字符串（不是数组下标），词库增删/重排都不会错位
import { readJSON, writeJSON } from './storage'

export type Session = {
  /** 所属词书的 filterKey */
  key: string
  /** 这一组要学的词（word 字符串） */
  words: string[]
}

const KEY = 'vocab-session'

export function loadSession(): Session | null {
  return readJSON<Session>(KEY, (v) => {
    if (typeof v !== 'object' || v === null) return null
    const s = v as { key?: unknown; words?: unknown }
    if (typeof s.key !== 'string' || !Array.isArray(s.words)) return null
    const list = s.words.filter((x): x is string => typeof x === 'string')
    if (list.length === 0) return null
    return { key: s.key, words: list }
  })
}

export function saveSession(s: Session): void {
  writeJSON(KEY, s)
}
