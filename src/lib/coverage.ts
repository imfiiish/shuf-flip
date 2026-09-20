// 词汇覆盖：全局按「词」记录「碰到过 / 翻开过」的去重词集。
// - 永久累计、按逻辑日不清零
// - 按词而不是按词书：同一词在多本书里都算；删书也不清（碰过的词就是碰过）
import { readJSON, writeJSON } from './storage'

const KEY = 'vocab-coverage'

type Store = { seen: string[]; revealed: string[] }

/** 内存缓存，避免每次翻卡都读/写 localStorage */
let cache: { seen: Set<string>; revealed: Set<string> } | null = null

function load(): { seen: Set<string>; revealed: Set<string> } {
  if (cache) return cache
  const raw = readJSON<Store>(KEY, (v) => {
    if (typeof v !== 'object' || v === null) return null
    const o = v as { seen?: unknown; revealed?: unknown }
    const arr = (x: unknown) =>
      Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []
    return { seen: arr(o.seen), revealed: arr(o.revealed) }
  })
  cache = {
    seen: new Set(raw?.seen ?? []),
    revealed: new Set(raw?.revealed ?? []),
  }
  return cache
}

function persist(c: { seen: Set<string>; revealed: Set<string> }): void {
  writeJSON(KEY, { seen: [...c.seen], revealed: [...c.revealed] })
}

/** 词成为中心卡：记「碰到」（去重） */
export function markSeen(word: string): void {
  const c = load()
  if (c.seen.has(word)) return
  c.seen.add(word)
  persist(c)
}

/** 展开释义：记「翻开」（去重；翻开必然也碰到） */
export function markRevealed(word: string): void {
  const c = load()
  let dirty = false
  if (!c.seen.has(word)) {
    c.seen.add(word)
    dirty = true
  }
  if (!c.revealed.has(word)) {
    c.revealed.add(word)
    dirty = true
  }
  if (dirty) persist(c)
}

/** 某个词表里各有多少词已经碰到 / 翻开 */
export function coverageCounts(words: readonly string[]): {
  seen: number
  revealed: number
} {
  const c = load()
  let seen = 0
  let revealed = 0
  for (const w of words) {
    if (c.seen.has(w)) seen += 1
    if (c.revealed.has(w)) revealed += 1
  }
  return { seen, revealed }
}
