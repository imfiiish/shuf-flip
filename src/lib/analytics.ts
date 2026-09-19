// 事件日志：dev 下把动作追加到 logs/events-<page>-<逻辑日>.jsonl（经 Vite 中间件）
// page = study / quiz，按 type 前缀路由：quiz_* → quiz，其余 → study
//
// - 每条事件带信封：t(ISO 本地) / ld(逻辑日) / sid(会话) / type
// - 缓冲 + 微批量发送；页面隐藏/卸载用 sendBeacon 兜底
// - 只在 import.meta.env.DEV 生效（生产没有中间件）
import { isoLocal, logicalDay } from './day'

type Payload = Record<string, unknown>

const isDev = import.meta.env.DEV

let sid = ''
let buffer: string[] = []
let timer: ReturnType<typeof setTimeout> | undefined

function newSid(): string {
  const rand = Math.random().toString(36).slice(2, 6)
  return `s-${Date.now().toString(36)}-${rand}`
}

/** 确保已有一个会话 id（不覆盖）：同一页面加载内 study↔quiz 共用一个 sid */
export function ensureSession(): void {
  if (!sid) sid = newSid()
}

function send(useBeacon: boolean): void {
  if (buffer.length === 0) return
  const body = buffer.join('\n')
  buffer = []
  if (useBeacon && typeof navigator.sendBeacon === 'function') {
    navigator.sendBeacon('/__events', new Blob([body], { type: 'application/x-ndjson' }))
    return
  }
  void fetch('/__events', {
    method: 'POST',
    body,
    keepalive: true,
    headers: { 'Content-Type': 'application/x-ndjson' },
  }).catch(() => {
    /* 记录失败不影响使用 */
  })
}

function schedule(): void {
  if (timer !== undefined) return
  timer = setTimeout(() => {
    timer = undefined
    send(false)
  }, 30)
}

/** 立即用 sendBeacon 发出缓冲区（页面卸载时用） */
export function flushBeacon(): void {
  send(true)
}

/** 追加一条事件（dev 下才会真正发出） */
export function logEvent(type: string, payload: Payload = {}): void {
  if (!isDev) return
  if (!sid) ensureSession()
  const now = Date.now()
  buffer.push(
    JSON.stringify({ t: isoLocal(now), ld: logicalDay(now), sid, type, ...payload }),
  )
  schedule()
}

if (isDev && typeof window !== 'undefined') {
  const flushNow = () => send(true)
  window.addEventListener('pagehide', flushNow)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow()
  })
}
