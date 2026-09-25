// Model B 客户端辅助：上报动作 / 进度 / 评分。
// 全部 best-effort：网络失败忽略，服务端靠 PK 幂等，下次可重传。
import { api, type ActionSlot, type StudySummary } from './api'

/** 上报一轮动作 */
export function reportActions(roundId: number, slots: ActionSlot[]): void {
  if (roundId <= 0 || slots.length === 0) return
  void api.studyActions(roundId, slots).catch(() => {})
}

/** 关页时用 keepalive 尽量把动作送出去 */
export function reportActionsBeacon(
  roundId: number,
  slots: ActionSlot[],
): void {
  if (roundId <= 0 || slots.length === 0) return
  try {
    void fetch('/api/study/actions', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roundId, slots }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* 忽略 */
  }
}

let progressTimer: ReturnType<typeof setTimeout> | undefined
let progressPending: { fk: string; center: number } | null = null

/** 上报当前卡片下标（debounce 合并，很小） */
export function reportProgress(fk: string, center: number): void {
  progressPending = { fk, center }
  if (progressTimer) return
  progressTimer = setTimeout(() => {
    progressTimer = undefined
    const p = progressPending
    progressPending = null
    if (p) void api.studyProgress(p.fk, p.center).catch(() => {})
  }, 1000)
}

/** quiz 评分上报 */
export function reportRatings(
  ratings: { word: string; rating: number }[],
): void {
  if (ratings.length === 0) return
  void api.studyRatings(ratings).catch(() => {})
}

/** Home 汇总 */
export function fetchSummary(fk: string): Promise<StudySummary> {
  return api.studySummary(fk)
}
