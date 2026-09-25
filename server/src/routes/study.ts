import { Hono } from 'hono'
import { pool } from '../db'
import { currentUserId } from '../session'
import { advance, ensureCascade, type Cascade } from '../sampling'

// Model B：服务器发牌 + 收动作。全部需要登录。
export const study = new Hono()

/** filterKey（`i:a,b|e:c`）→ include/exclude */
function parseFilterKey(fk: string): { include: string[]; exclude: string[] } {
  const [inc = '', exc = ''] = fk.replace(/^i:/, '').split('|e:')
  const split = (s: string) => (s ? s.split(',') : [])
  return { include: split(inc), exclude: split(exc) }
}

/** 当前筛选下的词池（保持 word 排序，稳定） */
async function poolOf(fk: string): Promise<string[]> {
  const { include, exclude } = parseFilterKey(fk)
  const r = await pool.query<{ word: string }>(
    `select word from words
      where not (tags && $2::text[])
        and (cardinality($1::text[]) = 0 or tags && $1::text[])
      order by word`,
    [include, exclude],
  )
  return r.rows.map((x) => x.word)
}

async function loadCascade(userId: number, fk: string): Promise<Cascade | null> {
  const r = await pool.query<{ r: number; levels: string[][]; round: string[] }>(
    'select r, levels, round from cascades where user_id = $1 and fk = $2',
    [userId, fk],
  )
  const row = r.rows[0]
  if (!row) return null
  return { r: row.r, levels: row.levels ?? [], round: row.round ?? [] }
}

async function saveCascade(
  userId: number,
  fk: string,
  c: Cascade,
): Promise<void> {
  await pool.query(
    `insert into cascades (user_id, fk, r, levels, round, updated_at)
     values ($1, $2, $3, $4, $5, now())
     on conflict (user_id, fk) do update set
       r = excluded.r, levels = excluded.levels, round = excluded.round, updated_at = now()`,
    [userId, fk, c.r, JSON.stringify(c.levels), JSON.stringify(c.round)],
  )
}

/** 物化这一轮，返回 roundId（重复调用幂等） */
async function materialize(
  userId: number,
  fk: string,
  r: number,
  wordList: string[],
): Promise<number> {
  await pool.query(
    `insert into rounds (user_id, fk, r, word_list) values ($1, $2, $3, $4)
     on conflict (user_id, fk, r) do nothing`,
    [userId, fk, r, wordList],
  )
  const idr = await pool.query<{ id: number }>(
    'select id from rounds where user_id = $1 and fk = $2 and r = $3',
    [userId, fk, r],
  )
  return Number(idr.rows[0].id)
}

/**
 * 取当前轮 / 前进一轮。
 * body: { fk, advance? }；advance=true 表示「上一轮已看完，来下一轮」。
 */
study.post('/round', async (c) => {
  const userId = await currentUserId(c)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const body = (await c.req.json().catch(() => null)) as {
    fk?: unknown
    advance?: unknown
  } | null
  const fk = typeof body?.fk === 'string' ? body.fk : null
  if (!fk) return c.json({ error: 'invalid' }, 400)

  const words = await poolOf(fk)
  if (words.length === 0) return c.json({ error: 'empty' }, 400)

  const stored = await loadCascade(userId, fk)
  let { cascade, generated } = ensureCascade(stored, words)
  if (body?.advance === true && !generated) {
    cascade = advance(cascade, words)
    generated = true
  }

  await saveCascade(userId, fk, cascade)
  const roundId = await materialize(userId, fk, cascade.r, cascade.round)

  const prog = await pool.query<{ center: number }>(
    'select center from user_progress where user_id = $1 and fk = $2',
    [userId, fk],
  )
  return c.json({
    roundId,
    r: cascade.r,
    fk,
    round: cascade.round,
    center: prog.rows[0]?.center ?? 0,
    generated,
  })
})

/** 记录一张卡的下标（很频繁、很小） */
study.put('/progress', async (c) => {
  const userId = await currentUserId(c)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)
  const body = (await c.req.json().catch(() => null)) as {
    fk?: unknown
    center?: unknown
  } | null
  const fk = typeof body?.fk === 'string' ? body.fk : null
  const center = Number(body?.center)
  if (!fk || !Number.isInteger(center) || center < 0) {
    return c.json({ error: 'invalid' }, 400)
  }
  await pool.query(
    `insert into user_progress (user_id, fk, center, updated_at)
     values ($1, $2, $3, now())
     on conflict (user_id, fk) do update set center = excluded.center, updated_at = now()`,
    [userId, fk, center],
  )
  return c.json({ ok: true })
})

type SlotInput = {
  slot?: unknown
  met?: unknown
  reveals?: unknown
  rating?: unknown
}

/** 上报一轮里每个槽位的动作（幂等：重复传同一轮不会重复计数） */
study.post('/actions', async (c) => {
  const userId = await currentUserId(c)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const body = (await c.req.json().catch(() => null)) as {
    roundId?: unknown
    slots?: unknown
  } | null
  const roundId = Number(body?.roundId)
  if (!Number.isInteger(roundId) || roundId <= 0) {
    return c.json({ error: 'invalid' }, 400)
  }
  const slots = Array.isArray(body?.slots) ? (body.slots as SlotInput[]) : null
  if (!slots) return c.json({ error: 'invalid' }, 400)

  const rq = await pool.query<{ word_list: string[] }>(
    'select word_list from rounds where id = $1 and user_id = $2',
    [roundId, userId],
  )
  const round = rq.rows[0]
  if (!round) return c.json({ error: 'not_found' }, 404)

  const client = await pool.connect()
  let applied = 0
  try {
    await client.query('begin')
    for (const raw of slots) {
      const slot = Number(raw.slot)
      if (!Number.isInteger(slot) || slot < 0 || slot >= round.word_list.length) {
        continue
      }
      const word = round.word_list[slot]
      const met = raw.met === true
      const reveals = Number.isFinite(Number(raw.reveals))
        ? Math.max(0, Math.trunc(Number(raw.reveals)))
        : 0
      const rating =
        raw.rating === 1 || raw.rating === 2 || raw.rating === 3
          ? (raw.rating as 1 | 2 | 3)
          : null
      const checked = reveals > 0

      const prev = await client.query<{ met: boolean; checked: boolean }>(
        'select met, checked from actions where round_id = $1 and slot = $2',
        [roundId, slot],
      )
      const oldMet = prev.rows[0]?.met ?? false
      const oldChecked = prev.rows[0]?.checked ?? false

      await client.query(
        `insert into actions (round_id, slot, met, checked, reveals, rating, updated_at)
         values ($1, $2, $3, $4, $5, $6, now())
         on conflict (round_id, slot) do update set
           met = excluded.met, checked = excluded.checked, reveals = excluded.reveals,
           rating = coalesce(excluded.rating, actions.rating), updated_at = now()`,
        [roundId, slot, met, checked, reveals, rating],
      )

      const dMet = (met ? 1 : 0) - (oldMet ? 1 : 0)
      const dChecked = (checked ? 1 : 0) - (oldChecked ? 1 : 0)
      if (dMet === 0 && dChecked === 0 && rating === null) continue

      await client.query(
        `insert into user_word_stats (user_id, word, met, checked, rating, last_at)
         values ($1, $2, greatest(0, $3), greatest(0, $4), $5, now())
         on conflict (user_id, word) do update set
           met = greatest(0, user_word_stats.met + $3),
           checked = greatest(0, user_word_stats.checked + $4),
           rating = coalesce($5, user_word_stats.rating),
           last_at = now()`,
        [userId, word, dMet, dChecked, rating],
      )
      applied++
    }
    await client.query('commit')
  } catch (e) {
    await client.query('rollback')
    throw e
  } finally {
    client.release()
  }
  return c.json({ ok: true, applied })
})

/** quiz 评分：更新词级 rating（quiz 词不属于某个 round，单独上报） */
study.post('/ratings', async (c) => {
  const userId = await currentUserId(c)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const body = (await c.req.json().catch(() => null)) as {
    ratings?: unknown
  } | null
  const list = Array.isArray(body?.ratings) ? body.ratings : null
  if (!list) return c.json({ error: 'invalid' }, 400)

  const client = await pool.connect()
  let applied = 0
  try {
    await client.query('begin')
    for (const raw of list as { word?: unknown; rating?: unknown }[]) {
      const word = typeof raw?.word === 'string' ? raw.word : null
      const rating = raw?.rating
      if (!word || (rating !== 1 && rating !== 2 && rating !== 3)) continue
      await client.query(
        `insert into user_word_stats (user_id, word, rating, last_at)
         values ($1, $2, $3, now())
         on conflict (user_id, word) do update set
           rating = excluded.rating, last_at = now()`,
        [userId, word, rating],
      )
      applied++
    }
    await client.query('commit')
  } catch (e) {
    await client.query('rollback')
    throw e
  } finally {
    client.release()
  }
  return c.json({ ok: true, applied })
})

/** Home 用：某本书的 total / seen / revealed */
study.get('/summary', async (c) => {
  const userId = await currentUserId(c)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)
  const fk = c.req.query('fk')
  if (!fk) return c.json({ error: 'invalid' }, 400)

  const words = await poolOf(fk)
  const total = words.length
  if (total === 0) return c.json({ total: 0, seen: 0, revealed: 0 })

  const r = await pool.query<{ seen: string; revealed: string }>(
    `select
       count(*) filter (where met > 0)     as seen,
       count(*) filter (where checked > 0) as revealed
     from user_word_stats
     where user_id = $1 and word = any($2::text[])`,
    [userId, words],
  )
  return c.json({
    total,
    seen: Number(r.rows[0]?.seen ?? 0),
    revealed: Number(r.rows[0]?.revealed ?? 0),
  })
})
