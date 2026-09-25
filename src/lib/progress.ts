// 学习相关的本地持久化（IndexedDB）
// - 翻开次数：每天一条 revealDay 记录（当天圆点用，4:00 换日归零），历史保留。
import { logicalDay } from './day'
import { loadStore, put, restoreMap } from './kv'

type DayCounts = Record<string, number>

/** 当天（当前逻辑日）各词的翻开次数：圆点用 */
let todayDay = ''
let todayCounts: DayCounts = {}
/** date → 当天各词翻开次数 */
let allDays = new Map<string, DayCounts>()

/** 读取翻开次数。若存储里是旧的一天，返回已清空的当天 store。 */
export function loadRevealStore(now: number = Date.now()): {
  day: string
  counts: DayCounts
} {
  const today = logicalDay(now)
  if (todayDay !== today) {
    todayDay = today
    todayCounts = {}
  }
  return { day: today, counts: todayCounts }
}

/** 落盘当天次数（只写今天这条）。 */
export function saveRevealStore(store: { day: string; counts: DayCounts }): void {
  if (store.day !== todayDay) {
    todayDay = store.day
    todayCounts = {}
  }
  todayCounts = { ...store.counts }
  allDays.set(todayDay, todayCounts)
  put('revealDay', todayDay, todayCounts)
}

/** 用远端数据整体替换（登出清理用）。 */
export function revealDayRestore(obj: unknown): void {
  allDays = restoreMap('revealDay', allDays, obj, (v) =>
    v && typeof v === 'object' ? { ...(v as DayCounts) } : null,
  )
  const today = logicalDay()
  todayDay = today
  todayCounts = { ...(allDays.get(today) ?? {}) }
}

export async function hydrateProgress(): Promise<void> {
  const today = logicalDay()
  const days = await loadStore('revealDay')
  allDays = new Map()
  for (const [date, v] of Object.entries(days)) {
    if (v && typeof v === 'object') allDays.set(date, { ...(v as DayCounts) })
  }
  const todayRec = days[today]
  todayDay = today
  todayCounts =
    todayRec && typeof todayRec === 'object'
      ? { ...(todayRec as DayCounts) }
      : {}
}
