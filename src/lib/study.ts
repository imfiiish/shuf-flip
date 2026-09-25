// Model B 客户端辅助：上报当前轮进度（失焦推、聚焦拉）。
// 进度用位图：metMask / checkedMask（16 张卡各一位）。
import { api, type StudySummary } from './api'

export type RoundState = {
  roundId: number
  center: number
  metMask: number
  checkedMask: number
}

function send(s: RoundState): void {
  if (s.roundId <= 0) return
  void api
    .studyState(s.roundId, s.center, s.metMask, s.checkedMask)
    .catch(() => {})
}

let timer: ReturnType<typeof setTimeout> | undefined
let pending: RoundState | null = null

/** 合并抖动后发送（换卡很频繁） */
export function queueState(s: RoundState): void {
  pending = s
  if (timer) return
  timer = setTimeout(() => {
    timer = undefined
    const p = pending
    pending = null
    if (p) send(p)
  }, 800)
}

/** 立即发送（失焦 / 轮结束） */
export function sendStateNow(s: RoundState): void {
  if (timer) {
    clearTimeout(timer)
    timer = undefined
  }
  pending = null
  send(s)
}

/** 关页保底（keepalive） */
export function sendStateBeacon(s: RoundState): void {
  if (s.roundId <= 0) return
  try {
    void fetch('/api/study/state', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(s),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* 忽略 */
  }
}

/** Home 汇总 */
export function fetchSummary(fk: string): Promise<StudySummary> {
  return api.studySummary(fk)
}
