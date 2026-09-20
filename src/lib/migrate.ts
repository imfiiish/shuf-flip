// 旧存档清理：入口渲染前调用，把早期版本的遗留 key 处理掉。
import { readJSON, removeItem } from './storage'

const SESSION_KEY = 'vocab-session'
const ORDERS_KEY = 'vocab-round-orders'
const REVEAL_KEY = 'vocab-reveal-counts'

/** 读成 Record，失败返回 null */
function readObject(key: string): Record<string, unknown> | null {
  return readJSON<Record<string, unknown>>(key, (v) =>
    typeof v === 'object' && v !== null && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null,
  )
}

export function migrateLegacy(): void {
  // 一轮已改由 vocab-cascade 决定，旧的 session / orders 一并清掉
  removeItem(SESSION_KEY)
  removeItem(ORDERS_KEY)

  // reveal-counts 改成按逻辑日分桶后，旧的终身计数一律清空（不迁移）
  const reveal = readObject(REVEAL_KEY)
  if (reveal && typeof reveal.day !== 'string') {
    removeItem(REVEAL_KEY)
  }

  // 注：vocab-centers 的旧格式（下标 key / 数字值）不再兼容，
  // 读取时会被自动忽略、并在下一次保存时清掉，无需在此处理。
}
