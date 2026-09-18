// 一次性存档迁移：早期版本用「words 数组下标」当 ID，现在改用 word 字符串。
// 在入口渲染前调用，把旧格式就地转成新格式；已是新格式则跳过。
// 只能在词库顺序未变的前提下正确转换（当前词库是追加式扩展，符合）。
import { words } from '../data/words'
import { readJSON, writeJSON } from './storage'

const SESSION_KEY = 'vocab-session'
const ORDERS_KEY = 'vocab-round-orders'
const REVEAL_KEY = 'vocab-reveal-counts'
const CENTERS_KEY = 'vocab-centers'

/** 旧下标 → word 字符串（越界返回 null） */
function wordAt(index: unknown): string | null {
  return Number.isInteger(index) &&
    (index as number) >= 0 &&
    (index as number) < words.length
    ? words[index as number].word
    : null
}

/** 读成 Record，失败返回 null */
function readObject(key: string): Record<string, unknown> | null {
  return readJSON<Record<string, unknown>>(key, (v) =>
    typeof v === 'object' && v !== null && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null,
  )
}

/** 旧的下标数组 → word 数组；已经是字符串数组则返回 null（无需迁移） */
function toWords(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  if (value.every((x) => typeof x === 'string')) return null
  const out: string[] = []
  for (const x of value) {
    const w = wordAt(x)
    if (w) out.push(w)
  }
  return out
}

export function migrateIndexIds(): void {
  // session: { key, indices: number[] } → { key, words: string[] }
  const session = readObject(SESSION_KEY)
  if (session && session.words === undefined && session.indices !== undefined) {
    const list = toWords(session.indices)
    if (list) writeJSON(SESSION_KEY, { key: session.key, words: list })
  }

  // rounds: { filterKey: number[] } → { filterKey: string[] }
  const orders = readObject(ORDERS_KEY)
  if (orders) {
    let changed = false
    const next: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(orders)) {
      const converted = toWords(v)
      if (converted) {
        next[k] = converted
        changed = true
      } else if (Array.isArray(v)) {
        next[k] = v.filter((x): x is string => typeof x === 'string')
      }
    }
    if (changed) writeJSON(ORDERS_KEY, next)
  }

  // reveal-counts: { "60": 3 } → { "ignorance": 3 }
  const reveal = readObject(REVEAL_KEY)
  if (reveal) {
    let changed = false
    const next: Record<string, number> = {}
    for (const [k, v] of Object.entries(reveal)) {
      if (typeof v !== 'number') continue
      if (/^\d+$/.test(k)) {
        const w = wordAt(Number(k))
        if (w) {
          next[w] = v
          changed = true
        }
      } else {
        next[k] = v
      }
    }
    if (changed) writeJSON(REVEAL_KEY, next)
  }

  // centers: { "i:..|e:..|112.45": 6 } → { "i:..|e:..|ignorance.provoke": 6 }
  const centers = readObject(CENTERS_KEY)
  if (centers) {
    let changed = false
    const next: Record<string, number> = {}
    for (const [k, v] of Object.entries(centers)) {
      if (typeof v !== 'number') continue
      const cut = k.lastIndexOf('|')
      const tail = cut === -1 ? '' : k.slice(cut + 1)
      if (!/^\d+(\.\d+)*$/.test(tail)) {
        next[k] = v
        continue
      }
      const names = tail.split('.').map((n) => wordAt(Number(n)))
      if (names.some((n) => n === null)) {
        next[k] = v
        continue
      }
      next[k.slice(0, cut + 1) + names.join('.')] = v
      changed = true
    }
    if (changed) writeJSON(CENTERS_KEY, next)
  }
}
