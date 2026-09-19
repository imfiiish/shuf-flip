// 一次性存档迁移：早期版本用「words 数组下标」当 ID，现在改用 word 字符串。
// 在入口渲染前调用，把旧格式就地转成新格式；已是新格式则跳过。
// 只能在词库顺序未变的前提下正确转换（当前词库是追加式扩展，符合）。
import { words } from '../data/words'
import { readJSON, removeItem, writeJSON } from './storage'

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

export function migrateIndexIds(): void {
  // 一轮已改由 vocab-cascade 决定，旧的 session / orders 一并清掉
  removeItem(SESSION_KEY)
  removeItem(ORDERS_KEY)

  // reveal-counts: 改成按逻辑日分桶后，旧的终身计数一律清空（不迁移）
  const reveal = readObject(REVEAL_KEY)
  if (reveal && typeof reveal.day !== 'string') {
    removeItem(REVEAL_KEY)
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
