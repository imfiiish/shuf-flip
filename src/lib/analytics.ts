// 事件上报：缓冲 + 批量 POST 到后端 `/api/events`，落进 Postgres，供离线分析/校准。
// 与旧版区别：不再压缩成元组、不再写本地文件（Vite 中间件已移除），
// 直接以 { ts, type, data } 落库；data 里统一带一个会话 id `sid`（同一页面加载共用）。
import { api } from './api'

type Payload = Record<string, unknown>
type Ev = { ts: number; type: string; data: Payload }

/** 攒够这么多条立刻发 */
const MAX_BUFFER = 100
/** 否则最多等这么久发一次 */
const FLUSH_MS = 5000
/** 失败放回时的缓冲上限 */
const RETRY_CAP = 500

let sid = ''
let buffer: Ev[] = []
let timer: ReturnType<typeof setTimeout> | undefined

function newSid(): string {
  const rand = Math.random().toString(36).slice(2, 6)
  return `s-${Date.now().toString(36)}-${rand}`
}

/** 确保已有一个会话 id（同一页面加载内 study↔quiz 共用一个） */
export function ensureSession(): void {
  if (sid) return
  sid = newSid()
}

function schedule(): void {
  if (buffer.length >= MAX_BUFFER) {
    void flush(false)
    return
  }
  if (timer !== undefined) return
  timer = setTimeout(() => {
    timer = undefined
    void flush(false)
  }, FLUSH_MS)
}

async function flush(useBeacon: boolean): Promise<void> {
  if (timer !== undefined) {
    clearTimeout(timer)
    timer = undefined
  }
  if (buffer.length === 0) return
  const batch = buffer

  // 卸载时用 sendBeacon，尽量把最后一批送出去
  if (useBeacon && typeof navigator.sendBeacon === 'function') {
    buffer = []
    const blob = new Blob([JSON.stringify(batch)], { type: 'application/json' })
    navigator.sendBeacon('/api/events', blob)
    return
  }

  buffer = []
  try {
    await api.sendEvents(batch)
  } catch {
    // 失败：放回重试（有上限，避免无限增长）
    buffer = [...batch, ...buffer].slice(-RETRY_CAP)
    schedule()
  }
}

/** 立即用 sendBeacon 发出缓冲区（页面卸载时用） */
export function flushBeacon(): void {
  void flush(true)
}

/** 追加一条事件（未登录时后端会忽略，返回 stored:0） */
export function logEvent(type: string, payload: Payload = {}): void {
  ensureSession()
  buffer.push({ ts: Date.now(), type, data: { sid, ...payload } })
  schedule()
}

if (typeof window !== 'undefined') {
  const flushNow = () => void flush(true)
  window.addEventListener('pagehide', flushNow)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow()
  })
}
