// quiz 待考池：每本词书（filterKey）自上次 quiz 以来被 center 过的词。
//
// Study 每次中心卡变化 addPending；到 quiz 边界 takePending 取走并清空，
// 交给 armQuiz 抽样。这样 quiz 只考「刚学过的词」，而不是整个活跃窗口。
import { loadStore, put, del } from './kv'
import { isStringArray } from './guard'

let cache = new Map<string, string[]>()

/** 记一个被 center 过的词（去重） */
export function addPending(fk: string, word: string): void {
  const list = cache.get(fk)
  if (list) {
    if (list.includes(word)) return
    list.push(word)
    put('pendingQuiz', fk, list)
    return
  }
  const next = [word]
  cache.set(fk, next)
  put('pendingQuiz', fk, next)
}

/** 取出并清空该书的待考池（arm quiz 时调用） */
export function takePending(fk: string): string[] {
  const list = cache.get(fk)
  if (!list || list.length === 0) return []
  cache.delete(fk)
  del('pendingQuiz', fk)
  return [...list]
}

export async function hydratePending(): Promise<void> {
  const raw = await loadStore('pendingQuiz')
  cache = new Map()
  for (const [k, v] of Object.entries(raw)) {
    if (isStringArray(v)) cache.set(k, v)
  }
}

/** 导出待考池（同步用） */
export function pendingSnapshot(): Record<string, string[]> {
  return Object.fromEntries(cache)
}

/** 用远端数据整体替换本地（同步用） */
export function pendingRestore(obj: unknown): void {
  const next = new Map<string, string[]>()
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (isStringArray(v)) next.set(k, v)
    }
  }
  for (const k of cache.keys()) if (!next.has(k)) del('pendingQuiz', k)
  cache = next
  for (const [k, v] of next) put('pendingQuiz', k, v)
}
