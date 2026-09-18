// 逻辑日 / 本地时间格式化
// 逻辑日以本地时间 04:00 为界：04:00 之前算前一天

/** 一天的分界：本地时间 04:00 */
export const DAY_CUTOFF_MS = 4 * 60 * 60 * 1000

/** 逻辑日，格式 YYYY-MM-DD（本地时区，04:00 换日） */
export function logicalDay(ms: number = Date.now()): string {
  const d = new Date(ms - DAY_CUTOFF_MS)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 本地时间 ISO 8601，带时区偏移，如 2026-01-14T03:59:55.000+08:00（人可读） */
export function isoLocal(ms: number = Date.now()): string {
  const d = new Date(ms)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  const off = -d.getTimezoneOffset() // 分钟数，东为正
  const sign = off >= 0 ? '+' : '-'
  const abs = Math.abs(off)
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}` +
    `${sign}${p(Math.trunc(abs / 60))}:${p(abs % 60)}`
  )
}
