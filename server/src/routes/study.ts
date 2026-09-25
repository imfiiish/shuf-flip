import { Hono } from 'hono'
import { pool } from '../db'
import { currentUserId } from '../session'
import { advance, ensureCascade, type Cascade } from '../sampling'

// 服务器发牌 + 收动作。全部需要登录。
//
// 一次 quiz 就是「另一种轮」（rounds.kind='quiz'），quiz 评分就是
// 「带 rating 的动作」（actions.rating）。所以没有单独的 quizzes / quiz_ratings 表。
//
// 进度用位图：metMask / revealedMask（16 张卡各占一位），失焦推、聚焦拉。
export const study = new Hono()

/** filterKey（`i:a,b|e:c`）→ include/exclude */
function parseFilterKey(filterKey: string): {
  include: string[]
  exclude: string[]
} {
  const [inc = '', exc = ''] = filterKey.replace(/^i:/, '').split('|e:')
  const split = (s: string) => (s ? s.split(',') : [])
  return { include: split(inc), exclude: split(exc) }
}

/** 当前筛选下的词池（保持 word 排序，稳定） */
async function poolOf(filterKey: string): Promise<string[]> {
  const { include, exclude } = parseFilterKey(filterKey)
  const res = await pool.query<{ word: string }>(
    `select word from words
      where not (tags && $2::text[])
        and (cardinality($1::text[]) = 0 or tags && $1::text[])
      order by word`,
    [include, exclude],
  )
  return res.rows.map((x) => x.word)
}

async function loadCascade(
  userId: number,
  filterKey: string,
): Promise<Cascade | null> {
  const res = await pool.query<{
    round_seq: number
    levels: string[][]
    words: string[]
  }>('select round_seq, levels, words from cascades where user_id = $1 and filter_key = $2', [
    userId,
    filterKey,
  ])
  const row = res.rows[0]
  if (!row) return null
  return {
    roundSeq: row.round_seq,
    levels: row.levels ?? [],
    words: row.words ?? [],
  }
}

/** 写抽样状态（不动 center / last_quiz_round_seq） */
async function saveCascade(
  userId: number,
  filterKey: string,
  c: Cascade,
): Promise<void> {
  await pool.query(
    `insert into cascades (user_id, filter_key, round_seq, levels, words, updated_at)
     values ($1, $2, $3, $4, $5, now())
     on conflict (user_id, filter_key) do update set
       round_seq = excluded.round_seq, levels = excluded.levels,
       words = excluded.words, updated_at = now()`,
    [
      userId,
      filterKey,
      c.roundSeq,
      JSON.stringify(c.levels),
      JSON.stringify(c.words),
    ],
  )
}

/** 物化一轮，返回 roundId（重复调用幂等） */
async function materialize(
  userId: number,
  filterKey: string,
  kind: 'study' | 'quiz',
  roundSeq: number,
  words: string[],
): Promise<number> {
  await pool.query(
    `insert into rounds (user_id, filter_key, kind, round_seq, words)
     values ($1, $2, $3, $4, $5)
     on conflict (user_id, filter_key, kind, round_seq) do nothing`,
    [userId, filterKey, kind, roundSeq, words],
  )
  const idr = await pool.query<{ id: number }>(
    'select id from rounds where user_id = $1 and filter_key = $2 and kind = $3 and round_seq = $4',
    [userId, filterKey, kind, roundSeq],
  )
  return Number(idr.rows[0].id)
}

/** 这一轮当前的 met/revealed 位图（从 actions 还原） */
async function roundMasks(
  roundId: number,
): Promise<{ metMask: number; revealedMask: number }> {
  const res = await pool.query<{
    slot: number
    met: boolean
    revealed: boolean
  }>('select slot, met, revealed from actions where round_id = $1', [roundId])
  let metMask = 0
  let revealedMask = 0
  for (const row of res.rows) {
    if (row.met) metMask |= 1 << row.slot
    if (row.revealed) revealedMask |= 1 << row.slot
  }
  return { metMask, revealedMask }
}

/**
 * 取当前轮 / 前进一轮。
 * body: { filterKey, advance? }；advance=true 表示「上一轮已看完，来下一轮」。
 */
study.post('/round', async (c) => {
  const userId = await currentUserId(c)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const body = (await c.req.json().catch(() => null)) as {
    filterKey?: unknown
    advance?: unknown
  } | null
  const filterKey =
    typeof body?.filterKey === 'string' ? body.filterKey : null
  if (!filterKey) return c.json({ error: 'invalid' }, 400)

  const words = await poolOf(filterKey)
  if (words.length === 0) return c.json({ error: 'empty' }, 400)

  const stored = await loadCascade(userId, filterKey)
  let { cascade, generated } = ensureCascade(stored, words)
  if (body?.advance === true && !generated) {
    cascade = advance(cascade, words)
    generated = true
  }

  await saveCascade(userId, filterKey, cascade)
  const roundId = await materialize(
    userId,
    filterKey,
    'study',
    cascade.roundSeq,
    cascade.words,
  )

  // 新画的一轮 → 位置归零；只有「续上次」才用存的位置
  let center = 0
  if (generated) {
    await pool.query(
      'update cascades set center = 0 where user_id = $1 and filter_key = $2',
      [userId, filterKey],
    )
  } else {
    const centre = await pool.query<{ center: number }>(
      'select center from cascades where user_id = $1 and filter_key = $2',
      [userId, filterKey],
    )
    center = Number(centre.rows[0]?.center ?? 0)
  }

  const masks = await roundMasks(roundId)
  return c.json({
    roundId,
    roundSeq: cascade.roundSeq,
    filterKey,
    words: cascade.words,
    center,
    metMask: masks.metMask,
    revealedMask: masks.revealedMask,
    generated,
  })
})

/**
 * 推当前进度（失焦/轮结束/关页）。
 * body: { roundId, center, metMask, revealedMask }
 * 服务端按槽 OR 合并（只增不减），center 只在「是当前轮」时更新。
 */
study.put('/state', async (c) => {
  const userId = await currentUserId(c)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const body = (await c.req.json().catch(() => null)) as {
    roundId?: unknown
    center?: unknown
    metMask?: unknown
    revealedMask?: unknown
  } | null
  const roundId = Number(body?.roundId)
  const center = Number(body?.center)
  const metMask = Number(body?.metMask) || 0
  const revealedMask = Number(body?.revealedMask) || 0
  if (!Number.isInteger(roundId) || roundId <= 0) {
    return c.json({ error: 'invalid' }, 400)
  }
  if (!Number.isInteger(center) || center < 0) {
    return c.json({ error: 'invalid' }, 400)
  }

  const rq = await pool.query<{
    filter_key: string
    round_seq: number
    words: string[]
  }>(
    `select filter_key, round_seq, words from rounds
      where id = $1 and user_id = $2 and kind = 'study'`,
    [roundId, userId],
  )
  const round = rq.rows[0]
  if (!round) return c.json({ error: 'not_found' }, 404)

  const n = round.words.length
  const client = await pool.connect()
  try {
    await client.query('begin')

    const prev = await client.query<{
      slot: number
      met: boolean
      revealed: boolean
    }>('select slot, met, revealed from actions where round_id = $1', [roundId])
    const old = new Map(prev.rows.map((r) => [Number(r.slot), r]))

    for (let slot = 0; slot < n; slot++) {
      const newMet = ((metMask >> slot) & 1) === 1
      const newRevealed = ((revealedMask >> slot) & 1) === 1
      const o = old.get(slot)
      if (!newMet && !newRevealed && !o) continue

      const oldMet = o?.met ?? false
      const oldRevealed = o?.revealed ?? false

      await client.query(
        `insert into actions (round_id, slot, met, revealed, updated_at)
         values ($1, $2, $3, $4, now())
         on conflict (round_id, slot) do update set
           met = actions.met or excluded.met,
           revealed = actions.revealed or excluded.revealed,
           updated_at = now()`,
        [roundId, slot, newMet, newRevealed],
      )

      const dMet = !oldMet && newMet ? 1 : 0
      const dRevealed = !oldRevealed && newRevealed ? 1 : 0
      if (dMet || dRevealed) {
        await client.query(
          `insert into user_word_stats (user_id, word, met, revealed, last_at)
           values ($1, $2, $3, $4, now())
           on conflict (user_id, word) do update set
             met = user_word_stats.met + $3,
             revealed = user_word_stats.revealed + $4,
             last_at = now()`,
          [userId, round.words[slot], dMet, dRevealed],
        )
      }
    }

    // center 只在是当前轮时更新，避免旧轮把位置写歪
    const cur = await client.query<{ round_seq: number }>(
      'select round_seq from cascades where user_id = $1 and filter_key = $2',
      [userId, round.filter_key],
    )
    if (cur.rows[0] && Number(cur.rows[0].round_seq) === round.round_seq) {
      await client.query(
        `update cascades set center = $3, updated_at = now()
          where user_id = $1 and filter_key = $2`,
        [userId, round.filter_key, Math.min(center, Math.max(0, n - 1))],
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
 * 发 quiz：待考池 = last_quiz_round_seq 之后 met 过的词，随机至多 16 个。
 * 同轮已有则直接返回（续做）；没有待考词则 quizId=null。
 */
study.post('/quiz', async (c) => {
  const userId = await currentUserId(c)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const body = (await c.req.json().catch(() => null)) as {
    filterKey?: unknown
    roundSeq?: unknown
  } | null
  const filterKey =
    typeof body?.filterKey === 'string' ? body.filterKey : null
  const roundSeq = Number(body?.roundSeq)
  if (!filterKey || !Number.isInteger(roundSeq)) {
    return c.json({ error: 'invalid' }, 400)
  }

  const existing = await pool.query<{ id: number; words: string[] }>(
    `select id, words from rounds
      where user_id = $1 and filter_key = $2 and kind = 'quiz' and round_seq = $3`,
    [userId, filterKey, roundSeq],
  )
  if (existing.rows[0]) {
    return c.json({
      quizId: existing.rows[0].id,
      words: existing.rows[0].words,
    })
  }

  const lq = await pool.query<{ last_quiz_round_seq: number }>(
    'select last_quiz_round_seq from cascades where user_id = $1 and filter_key = $2',
    [userId, filterKey],
  )
  const lastRoundSeq = lq.rows[0]?.last_quiz_round_seq ?? 0

  // actions.slot 是 0 起，数组下标 1 起
  const words = await pool.query<{ word: string }>(
    `select word from (
       select distinct rd.words[a.slot + 1] as word
         from actions a
         join rounds rd on rd.id = a.round_id
        where rd.user_id = $1 and rd.filter_key = $2 and rd.kind = 'study'
          and a.met and rd.round_seq > $3
     ) t
     order by random()
     limit 16`,
    [userId, filterKey, lastRoundSeq],
  )
  const list = words.rows.map((r) => r.word)
  if (list.length === 0) return c.json({ quizId: null, words: [] })

  const quizId = await materialize(userId, filterKey, 'quiz', roundSeq, list)
  return c.json({ quizId, words: list })
})

/** 交 quiz 评分：写评分动作 + 更新词级 rating + 标记完成 + 推进 last_quiz_round_seq */
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

  const q = await pool.query<{
    filter_key: string
    round_seq: number
    words: string[]
  }>(
    `select filter_key, round_seq, words from rounds
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
      const slot = quiz.words.indexOf(word)
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
      `update cascades set last_quiz_round_seq = $3, updated_at = now()
        where user_id = $1 and filter_key = $2`,
      [userId, quiz.filter_key, quiz.round_seq],
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

/** Home 用：某本书的 total / met / revealed */
study.get('/summary', async (c) => {
  const userId = await currentUserId(c)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)
  const filterKey = c.req.query('filterKey')
  if (!filterKey) return c.json({ error: 'invalid' }, 400)

  const words = await poolOf(filterKey)
  const total = words.length
  if (total === 0) return c.json({ total: 0, met: 0, revealed: 0 })

  const res = await pool.query<{ met: string; revealed: string }>(
    `select
       count(*) filter (where met > 0)      as met,
       count(*) filter (where revealed > 0) as revealed
     from user_word_stats
     where user_id = $1 and word = any($2::text[])`,
    [userId, words],
  )
  return c.json({
    total,
    met: Number(res.rows[0]?.met ?? 0),
    revealed: Number(res.rows[0]?.revealed ?? 0),
  })
})
