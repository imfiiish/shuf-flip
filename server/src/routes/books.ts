import { Hono } from 'hono'
import { pool } from '../db'
import { currentUserId } from '../session'

// 用户词书：整体读/写（数量少、变更不频繁）。
export const books = new Hono()

books.get('/', async (c) => {
  const userId = await currentUserId(c)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)
  const r = await pool.query<{ books: unknown }>(
    'select books from user_books where user_id = $1',
    [userId],
  )
  return c.json({ books: r.rows[0]?.books ?? [] })
})

books.put('/', async (c) => {
  const userId = await currentUserId(c)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)
  const body = (await c.req.json().catch(() => null)) as {
    books?: unknown
  } | null
  // 松校验：数组、条数有上限（词书本来最多几本）
  if (!Array.isArray(body?.books) || body.books.length > 16) {
    return c.json({ error: 'invalid' }, 400)
  }
  await pool.query(
    `insert into user_books (user_id, books, updated_at)
     values ($1, $2, now())
     on conflict (user_id) do update set books = excluded.books, updated_at = now()`,
    [userId, JSON.stringify(body.books)],
  )
  return c.json({ ok: true })
})
