import { Hono } from 'hono'
import { pool } from '../db'
import { currentUserId } from '../session'
import { advance, ensureCascade, type Cascade } from '../sampling'

// Model B：服务器发牌 + 收动作。全部需要登录。
//
// 一次 quiz 就是「另一种轮」（rounds.kind='quiz'），quiz 评分就是
// 「带 rating 的动作」（actions.rating）。所以没有单独的 quizzes / quiz_ratings 表。
//
// 进度用位图：metMask / checkedMask（16 张卡各占一位），失焦推、聚焦拉。
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

/** 写抽样状态（不动 center / last_quiz_r） */
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

/** 物化一轮，返回 roundId（重复调用幂等） */
async function materialize(
  userId: number,
  fk: string,
  kind: 'study' | 'quiz',
  seq: number,
  wordList: string[],
): Promise<number> {
  await pool.query(
    `insert into rounds (user_id, fk, kind, seq, word_list)
     values ($1, $2, $3, $4, $5)
     on conflict (user_id, fk, kind, seq) do nothing`,
    [userId, fk, kind, seq, wordList],
  )
  const idr = await pool.query<{ id: number }>(
    'select id from rounds where user_id = $1 and fk = $2 and kind = $3 and seq = $4',
    [userId, fk, kind, seq],
  )
  return Number(idr.rows[0].id)
}

/** 这一轮当前的 met/checked 位图（从 actions 还原） */
async function roundMasks(
  roundId: number,
): Promise<{ metMask: number; checkedMask: number }> {
  const r = await pool.query<{ slot: number; met: boolean; reveals: number }>(
    'select slot, met, reveals from actions where round_id = $1',
    [roundId],
  )
  let metMask = 0
  let checkedMask = 0
  for (const row of r.rows) {
    if (row.met) metMask |= 1 << row.slot
    if (row.reveals > 0) checkedMask |= 1 << row.slot
  }
  return { metMask, checkedMask }
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
  const roundId = await materialize(
    userId,
    fk,
    'study',
    cascade.r,
    cascade.round,
  )

  // 新画的一轮 → 位置归零；只有「续上次」才用存的位置
  let center = 0
  if (generated) {
    await pool.query(
      'update cascades set center = 0 where user_id = $1 and fk = $2',
      [userId, fk],
    )
  } else {
    const centre = await pool.query<{ center: number }>(
      'select center from cascades where user_id = $1 and fk = $2',
      [userId, fk],
    )
    center = Number(centre.rows[0]?.center ?? 0)
  }

  const masks = await roundMasks(roundId)
  return c.json({
    roundId,
    r: cascade.r,
    fk,
    round: cascade.round,
    center,
    metMask: masks.metMask,
    checkedMask: masks.checkedMask,
    generated,
  })
})

/**
 * 推当前进度（失焦/轮结束/关页）。
 * body: { roundId, center, metMask, checkedMask }
 * 服务端按槽 OR 合并（只增不减），center 只在「是当前轮」时更新。
 */
study.put('/state', async (c) => {
  const userId = await currentUserId(c)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const body = (await c.req.json().catch(() => null)) as {
    roundId?: unknown
    center?: unknown
    metMask?: unknown
    checkedMask?: unknown
  } | null
  const roundId = Number(body?.roundId)
  const center = Number(body?.center)
  const metMask = Number(body?.metMask) || 0
  const checkedMask = Number(body?.checkedMask) || 0
  if (!Number.isInteger(roundId) || roundId <= 0) {
    return c.json({ error: 'invalid' }, 400)
  }
  if (!Number.isInteger(center) || center < 0) {
    return c.json({ error: 'invalid' }, 400)
  }

  const rq = await pool.query<{ fk: string; seq: number; word_list: string[] }>(
    `select fk, seq, word_list from rounds
      where id = $1 and user_id = $2 and kind = 'study'`,
    [roundId, userId],
  )
  const round = rq.rows[0]
  if (!round) return c.json({ error: 'not_found' }, 404)

  const n = round.word_list.length
  const client = await pool.connect()
  try {
    await client.query('begin')

    const prev = await client.query<{
      slot: number
      met: boolean
      reveals: number
    }>('select slot, met, reveals from actions where round_id = $1', [roundId])
    const old = new Map(prev.rows.map((r) => [Number(r.slot), r]))

    for (let slot = 0; slot < n; slot++) {
      const newMet = ((metMask >> slot) & 1) === 1
      const newChecked = ((checkedMask >> slot) & 1) === 1
      const o = old.get(slot)
      if (!newMet && !newChecked && !o) continue

      const oldMet = o?.met ?? false
      const oldChecked = (o?.reveals ?? 0) > 0

      await client.query(
        `insert into actions (round_id, slot, met, reveals, updated_at)
         values ($1, $2, $3, $4, now())
         on conflict (round_id, slot) do update set
           met = actions.met or excluded.met,
           reveals = greatest(actions.reveals, excluded.reveals),
           updated_at = now()`,
        [roundId, slot, newMet, newChecked ? 1 : 0],
      )

      const dMet = !oldMet && newMet ? 1 : 0
      const dChecked = !oldChecked && newChecked ? 1 : 0
      if (dMet || dChecked) {
        await client.query(
          `insert into user_word_stats (user_id, word, met, checked, last_at)
           values ($1, $2, $3, $4, now())
           on conflict (user_id, word) do update set
             met = user_word_stats.met + $3,
             checked = user_word_stats.checked + $4,
             last_at = now()`,
          [userId, round.word_list[slot], dMet, dChecked],
        )
      }
    }

    // center 只在是当前轮时更新，避免旧轮把位置写歪
    const cur = await client.query<{ r: number }>(
      'select r from cascades where user_id = $1 and fk = $2',
      [userId, round.fk],
    )
    if (cur.rows[0] && Number(cur.rows[0].r) === round.seq) {
      await client.query(
        `update cascades set center = $3, updated_at = now()
          where user_id = $1 and fk = $2`,
        [userId, round.fk, Math.min(center, Math.max(0, n - 1))],
      )
    }

    await client.query('commit')
  } catch (e) {
    await client.query('rollback')
    throw e
  } finally {
    client.release()
  }

  const masks = await roundMasks(roundId)
  return c.json({ ok: true, ...masks })
})

/**
 * 发 quiz：待考池 = last_quiz_r 之后 met 过的词，随机至多 16 个。
 * 同批次已有则直接返回（续做）；没有待考词则 quizId=null。
 */
study.post('/quiz', async (c) => {
  const userId = await currentUserId(c)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const body = (await c.req.json().catch(() => null)) as {
    fk?: unknown
    batch?: unknown
  } | null
  const fk = typeof body?.fk === 'string' ? body.fk : null
  const batch = Number(body?.batch)
  if (!fk || !Number.isInteger(batch)) return c.json({ error: 'invalid' }, 400)

  const existing = await pool.query<{ id: number; word_list: string[] }>(
    `select id, word_list from rounds
      where user_id = $1 and fk = $2 and kind = 'quiz' and seq = $3`,
    [userId, fk, batch],
  )
  if (existing.rows[0]) {
    return c.json({ quizId: existing.rows[0].id, words: existing.rows[0].word_list })
  }

  const lq = await pool.query<{ last_quiz_r: number }>(
    'select last_quiz_r from cascades where user_id = $1 and fk = $2',
    [userId, fk],
  )
  const lastR = lq.rows[0]?.last_quiz_r ?? 0

  // actions.slot 是 0 起，数组下标 1 起
  const words = await pool.query<{ word: string }>(
    `select word from (
       select distinct rd.word_list[a.slot + 1] as word
         from actions a
         join rounds rd on rd.id = a.round_id
        where rd.user_id = $1 and rd.fk = $2 and rd.kind = 'study'
          and a.met and rd.seq > $3
     ) t
     order by random()
     limit 16`,
    [userId, fk, lastR],
  )
  const list = words.rows.map((r) => r.word)
  if (list.length === 0) return c.json({ quizId: null, words: [] })

  const quizId = await materialize(userId, fk, 'quiz', batch, list)
  return c.json({ quizId, words: list })
})

/** 交 quiz 评分：写评分动作 + 更新词级 rating + 标记完成 + 推进 last_quiz_r */
study.post('/quiz/ratings', async (c) => {
  const userId = await currentUserId(c)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const body = (await c.req.json().catch(() => null)) as {
    quizId?: unknown
    ratings?: unknown
  } | null
  const quizId = Number(body?.quizId)
  if (!Number.isInteger(quizId) || quizId <= 0) {
    return c.json({ error: 'invalid' }, 400)
  }
  const list = Array.isArray(body?.ratings) ? body.ratings : null
  if (!list) return c.json({ error: 'invalid' }, 400)

  const q = await pool.query<{ fk: string; seq: number; word_list: string[] }>(
    `select fk, seq, word_list from rounds
      where id = $1 and user_id = $2 and kind = 'quiz'`,
    [quizId, userId],
  )
  const quiz = q.rows[0]
  if (!quiz) return c.json({ error: 'not_found' }, 404)

  const client = await pool.connect()
  let applied = 0
  try {
    await client.query('begin')
    for (const raw of list as { word?: unknown; rating?: unknown }[]) {
      const word = typeof raw?.word === 'string' ? raw.word : null
      const rating = raw?.rating
      if (!word || (rating !== 1 && rating !== 2 && rating !== 3)) continue
      const slot = quiz.word_list.indexOf(word)
      if (slot < 0) continue

      await client.query(
        `insert into actions (round_id, slot, rating, updated_at)
         values ($1, $2, $3, now())
         on conflict (round_id, slot) do update set
           rating = excluded.rating, updated_at = now()`,
        [quizId, slot, rating],
      )
      await client.query(
        `insert into user_word_stats (user_id, word, rating, last_at)
         values ($1, $2, $3, now())
         on conflict (user_id, word) do update set
           rating = excluded.rating, last_at = now()`,
        [userId, word, rating],
      )
      applied++
    }
    await client.query('update rounds set finished_at = now() where id = $1', [
      quizId,
    ])
    await client.query(
      `update cascades set last_quiz_r = $3, updated_at = now()
        where user_id = $1 and fk = $2`,
      [userId, quiz.fk, quiz.seq],
    )
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
