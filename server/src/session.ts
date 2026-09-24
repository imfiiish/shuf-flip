import { createHash, randomBytes } from 'node:crypto'
import type { Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { pool } from './db'
import { env } from './env'

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex')
const ttlMs = () => env.sessionTtlDays * 86400 * 1000

/** 新建会话，返回明文 token（只发这一次，库里只存哈希） */
export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  await pool.query(
    `insert into sessions (token_hash, user_id, expires_at)
     values ($1, $2, $3)`,
    [hashToken(token), userId, new Date(Date.now() + ttlMs())],
  )
  return token
}

/** 校验会话并滚动续期；无效/过期返回 null */
export async function getSession(token: string): Promise<number | null> {
  const h = hashToken(token)
  const res = await pool.query(
    'select user_id, expires_at from sessions where token_hash = $1',
    [h],
  )
  const row = res.rows[0]
  if (!row) return null
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await pool.query('delete from sessions where token_hash = $1', [h])
    return null
  }
  await pool.query('update sessions set expires_at = $2 where token_hash = $1', [
    h,
    new Date(Date.now() + ttlMs()),
  ])
  return Number(row.user_id)
}

export async function destroySession(token: string): Promise<void> {
  await pool.query('delete from sessions where token_hash = $1', [hashToken(token)])
}

/** 当前请求的登录用户 id（未登录返回 null） */
export async function currentUserId(c: Context): Promise<number | null> {
  const token = getCookie(c, env.cookieName)
  if (!token) return null
  return getSession(token)
}
