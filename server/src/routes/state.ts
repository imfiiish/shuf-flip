import { Hono } from 'hono'
import { pool } from '../db'
import { currentUserId } from '../session'

export const state = new Hono()

// 读取整包状态
state.get('/', async (c) => {
  const userId = await currentUserId(c)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)
  const r = await pool.query(
    'select data, rev from user_state where user_id = $1',
    [userId],
  )
  const row = r.rows[0]
  return c.json(row ? { data: row.data, rev: Number(row.rev) } : { data: {}, rev: 0 })
})

// 写入整包状态（乐观并发：只有 rev 匹配才更新，否则 409）
state.put('/', async (c) => {
  const userId = await currentUserId(c)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const body = await c.req.json().catch(() => null)
  const b = (body ?? {}) as { data?: unknown; rev?: unknown }
  if (typeof b.data !== 'object' || b.data === null) {
    return c.json({ error: 'invalid' }, 400)
  }
  const rev = Number.isInteger(b.rev) ? (b.rev as number) : 0

  const upd = await pool.query(
    `update user_state set data = $1, rev = rev + 1, updated_at = now()
      where user_id = $2 and rev = $3 returning rev`,
    [b.data, userId, rev],
  )
  if (upd.rowCount) return c.json({ rev: Number(upd.rows[0].rev) })

  // 没有行被更新：要么还没有状态（首次写入），要么 rev 冲突
  const exists = await pool.query('select rev from user_state where user_id = $1', [
    userId,
  ])
  if (!exists.rowCount) {
    const ins = await pool.query(
      'insert into user_state (user_id, data, rev) values ($1, $2, 1) returning rev',
      [userId, b.data],
    )
    return c.json({ rev: Number(ins.rows[0].rev) })
  }
  return c.json({ error: 'conflict', rev: Number(exists.rows[0].rev) }, 409)
})
