import { Hono } from 'hono'
import { pool } from '../db'
import { currentUserId } from '../session'

export const state = new Hono()

// 冲突时抛这个，由路由转成 409
class ConflictError extends Error {}

/** 读整包：progress（进度）+ data（统计），各自带 rev */
state.get('/', async (c) => {
  const userId = await currentUserId(c)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)
  const r = await pool.query(
    'select progress, progress_rev, data, data_rev from user_state where user_id = $1',
    [userId],
  )
  const row = r.rows[0]
  return c.json({
    progress: {
      data: row?.progress ?? {},
      rev: Number(row?.progress_rev ?? 0),
    },
    data: { data: row?.data ?? {}, rev: Number(row?.data_rev ?? 0) },
  })
})

type Col = 'progress' | 'data'

/** 乐观并发写入：rev 匹配则 +1，否则冲突；没有行则首插 */
async function writeBlob(
  userId: number,
  col: Col,
  value: unknown,
  rev: number,
): Promise<number> {
  const revCol = col === 'progress' ? 'progress_rev' : 'data_rev'
  const upd = await pool.query(
    `update user_state set ${col} = $1, ${revCol} = ${revCol} + 1, updated_at = now()
      where user_id = $2 and ${revCol} = $3 returning ${revCol}`,
    [value, userId, rev],
  )
  if (upd.rowCount) return Number(upd.rows[0][revCol])

  const exists = await pool.query('select 1 from user_state where user_id = $1', [
    userId,
  ])
  if (!exists.rowCount) {
    const ins = await pool.query(
      `insert into user_state (user_id, ${col}, ${revCol}) values ($1, $2, 1) returning ${revCol}`,
      [userId, value],
    )
    return Number(ins.rows[0][revCol])
  }
  throw new ConflictError()
}

function readBlob(c: Parameters<typeof currentUserId>[0], col: Col) {
  return async () => {
    const userId = await currentUserId(c)
    if (!userId) return c.json({ error: 'unauthorized' }, 401)
    const body = await c.req.json().catch(() => null)
    const b = (body ?? {}) as { data?: unknown; rev?: unknown }
    if (typeof b.data !== 'object' || b.data === null) {
      return c.json({ error: 'invalid' }, 400)
    }
    const rev = Number.isInteger(b.rev) ? (b.rev as number) : 0
    try {
      return c.json({ rev: await writeBlob(userId, col, b.data, rev) })
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e
      const revCol = col === 'progress' ? 'progress_rev' : 'data_rev'
      const cur = await pool.query(
        `select ${revCol} as rev from user_state where user_id = $1`,
        [userId],
      )
      return c.json({ error: 'conflict', rev: Number(cur.rows[0]?.rev ?? 0) }, 409)
    }
  }
}

// 进度（小、推得勤）
state.put('/progress', (c) => readBlob(c, 'progress')())
// 统计（大、每轮推）
state.put('/data', (c) => readBlob(c, 'data')())
