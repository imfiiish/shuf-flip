// 逻辑日 / 本地时间格式化
// 逻辑日以本地时间 04:00 为界：04:00 之前算前一天

/** 一天的分界：本地时间 04:00 */
const DAY_CUTOFF_MS = 4 * 60 * 60 * 1000

/** 逻辑日，格式 YYYY-MM-DD（本地时区，04:00 换日） */
export function logicalDay(ms: number = Date.now()): string {
  const d = new Date(ms - DAY_CUTOFF_MS)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
