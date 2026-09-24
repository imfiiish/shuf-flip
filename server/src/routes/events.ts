import { Hono } from 'hono'
import { pool } from '../db'
import { currentUserId } from '../session'

export const events = new Hono()

// 事件上报（批量）。游客默认不采集：未登录直接忽略，返回 stored:0。
events.post('/', async (c) => {
  const userId = await currentUserId(c)
  if (!userId) return c.json({ ok: true, stored: 0 })

  const body = await c.req.json().catch(() => null)
  const list: unknown[] | null = Array.isArray(body)
    ? body
    : Array.isArray((body as { events?: unknown[] } | null)?.events)
      ? (body as { events: unknown[] }).events
      : null
  if (!list) return c.json({ error: 'invalid' }, 400)

  let stored = 0
  for (const raw of list) {
    const e = raw as { ts?: unknown; type?: unknown; data?: unknown }
    if (typeof e?.type !== 'string' || !e.ts) continue
    const ts = new Date(e.ts as string | number)
    if (Number.isNaN(ts.getTime())) continue
    await pool.query(
      'insert into events (user_id, ts, type, data) values ($1, $2, $3, $4)',
      [userId, ts, e.type, e.data ?? {}],
    )
    stored++
  }
  return c.json({ ok: true, stored })
})
