// 词汇覆盖：全局按「词」记录「碰到过 / 翻开过」的去重词集。
// - 永久累计、按逻辑日不清零
// - 按词而不是按词书：同一词在多本书里都算；删书也不清（碰过的词就是碰过）
//
// 存储：IndexedDB `coverage`，key=word，value 1=碰到 / 2=翻开（按词单条写）
import { loadStore, put } from './kv'

let seen = new Set<string>()
let revealed = new Set<string>()

/** 词成为中心卡：记「碰到」（去重） */
export function markSeen(word: string): void {
  if (seen.has(word)) return
  seen.add(word)
  put('coverage', word, revealed.has(word) ? 2 : 1)
}

/** 展开释义：记「翻开」（去重；翻开必然也碰到） */
export function markRevealed(word: string): void {
  let changed = false
  if (!seen.has(word)) {
    seen.add(word)
    changed = true
  }
  if (!revealed.has(word)) {
    revealed.add(word)
    changed = true
  }
  if (changed) put('coverage', word, 2)
}

/** 某个词表里各有多少词已经碰到 / 翻开 */
export function coverageCounts(words: readonly string[]): {
  seen: number
  revealed: number
} {
  let s = 0
  let r = 0
  for (const w of words) {
    if (seen.has(w)) s += 1
    if (revealed.has(w)) r += 1
  }
  return { seen: s, revealed: r }
}

export async function hydrateCoverage(): Promise<void> {
  const raw = await loadStore('coverage')
  seen = new Set()
  revealed = new Set()
  for (const [w, v] of Object.entries(raw)) {
    seen.add(w)
    if (v === 2) revealed.add(w)
  }
}
