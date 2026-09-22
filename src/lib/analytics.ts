// 事件日志：dev 下把动作追加到 logs/events-<page>-<ld>.jsonl（经 Vite 中间件）
//
// 为省体积，格式是「会话头 + 元组」：
//   首行（每个会话/跨逻辑日一次）：
//     {"h":1,"sid":"…","ld":"YYYY-MM-DD","p":"study|quiz","t0":<epoch ms>}
//   其后每条事件（数组，无键名）：
//     [code, dt, …args]        dt = 相对 t0 的毫秒
//   code 与 args 顺序见 EVENTS；解码时先读头、再按 EVENTS 还原。
//
// - 只在 import.meta.env.DEV 生效（生产没有中间件）
// - 缓冲 + 微批量发送；页面隐藏/卸载用 sendBeacon 兜底
import { logicalDay } from './day'
import EVENTS from './events.json'

type Payload = Record<string, unknown>

// 事件表见 events.json（与 scripts/decode-events.mjs 共用）；code 0–9=study / ≥10=quiz
const BY_TYPE = new Map(EVENTS.map((e) => [e.type, e]))

const isDev = import.meta.env.DEV

let sid = ''
let t0 = 0
let buffer: string[] = []
let timer: ReturnType<typeof setTimeout> | undefined
/** 本次会话是否已发过头行；headDay = 头行所属逻辑日（跨日补新头） */
let bufferHeadSent = false
let headDay = ''

function newSid(): string {
  const rand = Math.random().toString(36).slice(2, 6)
  return `s-${Date.now().toString(36)}-${rand}`
}

/** 当前页面名（仅用于事件落盘分文件） */
function pageName(): 'study' | 'quiz' {
  return typeof location !== 'undefined' && location.pathname.startsWith('/quiz')
    ? 'quiz'
    : 'study'
}

/** 确保已有一个会话 id（不覆盖）：同一页面加载内 study↔quiz 共用一个 sid */
export function ensureSession(): void {
  if (sid) return
  sid = newSid()
  t0 = Date.now()
}

/** 会话头行；跨逻辑日会重新发一次（t0 重置） */
function pushHeader(): void {
  buffer.push(
    JSON.stringify({
      h: 1,
      sid,
      ld: logicalDay(t0),
      p: pageName(),
      t0,
    }),
  )
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
  ensureSession()
  const def = BY_TYPE.get(type)
  if (!def) return

  // 每次 write 前确保本会话已有头行；跨逻辑日补一个新头
  if (!bufferHeadSent) {
    bufferHeadSent = true
    headDay = logicalDay(t0)
    pushHeader()
  } else if (logicalDay() !== headDay) {
    t0 = Date.now()
    headDay = logicalDay(t0)
    pushHeader()
  }

  const now = Date.now()
  const args = def.fields.map((f) => payload[f] ?? null)
  buffer.push(JSON.stringify([def.code, now - t0, ...args]))
  schedule()
}

if (isDev && typeof window !== 'undefined') {
  const flushNow = () => send(true)
  window.addEventListener('pagehide', flushNow)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow()
  })
}
