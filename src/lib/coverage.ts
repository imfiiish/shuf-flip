// 词汇覆盖：全局按「词」记录「碰到过」。
// 「翻开过」不在这里存 —— 它等价于该词翻开次数 > 0（见 progress.revealedCount）。
import { loadStore, put } from './kv'

let seen = new Set<string>()

/** 词成为中心卡：记「碰到」（去重） */
export function markSeen(word: string): void {
  if (seen.has(word)) return
  seen.add(word)
  put('coverage', word, 1)
}

/** 某个词表里有多少词碰到过 */
export function coverageSeen(words: readonly string[]): number {
  let n = 0
  for (const w of words) if (seen.has(w)) n += 1
  return n
}

export async function hydrateCoverage(): Promise<void> {
  seen = new Set(Object.keys(await loadStore('coverage')))
}
