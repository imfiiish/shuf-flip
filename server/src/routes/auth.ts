import { Hono } from 'hono'
import { getConnInfo } from '@hono/node-server/conninfo'
import { setCookie, getCookie, deleteCookie } from 'hono/cookie'
import type { Context } from 'hono'
import { pool } from '../db'
import { env } from '../env'
import { hashPassword, verifyPassword } from '../password'
import { isBanned } from '../banned'
import { createSession, currentUserId, destroySession } from '../session'
import { checkLogin, recordFail, clearFail } from '../rate'

export const auth = new Hono()

/** 3–20 位，字母开头，只含小写字母/数字 */
const USERNAME_RE = /^[a-z][a-z0-9]{2,19}$/
const PASSWORD_RE = /^\d{4}$/

function cookieOpts() {
  return {
    httpOnly: true,
    sameSite: 'Lax' as const,
    path: '/',
    maxAge: env.sessionTtlDays * 86400,
    secure: env.secureCookies,
  }
}

function clientIp(c: Context): string {
  const xff = c.req.header('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  try {
    return getConnInfo(c).remote.address ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

function readCreds(body: unknown): { lower: string; raw: string; password: string } {
  const b = (body ?? {}) as Record<string, unknown>
  const raw = typeof b.username === 'string' ? b.username.trim() : ''
  return {
    raw,
    lower: raw.toLowerCase(),
    password: typeof b.password === 'string' ? b.password : '',
  }
}

auth.post('/register', async (c) => {
  const body = await c.req.json().catch(() => null)
  const { lower, raw, password } = readCreds(body)
  if (!USERNAME_RE.test(lower)) return c.json({ error: 'invalid_username' }, 400)
  if (!PASSWORD_RE.test(password))
    return c.json({ error: 'invalid_password' }, 400)
  if (isBanned(lower)) return c.json({ error: 'username_unavailable' }, 400)

  const dup = await pool.query('select 1 from users where username = $1', [lower])
  if (dup.rowCount) return c.json({ error: 'username_taken' }, 409)

  const consent = (body as { consent?: unknown } | null)?.consent === true
  const hash = await hashPassword(password)
  const res = await pool.query(
    `insert into users (username, display, password_hash, consent_at)
     values ($1, $2, $3, $4) returning id`,
    [lower, raw || lower, hash, consent ? new Date() : null],
  )
  const userId = Number(res.rows[0].id)
  const token = await createSession(userId, c.req.header('user-agent') ?? null)
  setCookie(c, env.cookieName, token, cookieOpts())
  return c.json({ user: { id: userId, username: lower, display: raw || lower } })
})

auth.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null)
  const { lower, password } = readCreds(body)
  if (!USERNAME_RE.test(lower) || !PASSWORD_RE.test(password)) {
    return c.json({ error: 'invalid_credentials' }, 401)
  }
  const ip = clientIp(c)
  const gate = await checkLogin(lower, ip)
  if (!gate.ok) {
    c.header('Retry-After', String(gate.retryAfter))
    return c.json({ error: 'too_many_attempts', retryAfter: gate.retryAfter }, 429)
  }

  const res = await pool.query(
    'select id, display, password_hash from users where username = $1',
    [lower],
  )
  const row = res.rows[0]
  const ok = row ? await verifyPassword(password, row.password_hash) : false
  if (!ok) {
    await recordFail(lower, ip)
    return c.json({ error: 'invalid_credentials' }, 401)
  }

  await clearFail(lower)
  const userId = Number(row.id)
  const token = await createSession(userId, c.req.header('user-agent') ?? null)
  setCookie(c, env.cookieName, token, cookieOpts())
  return c.json({ user: { id: userId, username: lower, display: row.display } })
})

auth.post('/logout', async (c) => {
  const token = getCookie(c, env.cookieName)
  if (token) await destroySession(token)
  deleteCookie(c, env.cookieName, { path: '/' })
  return c.json({ ok: true })
})

auth.get('/me', async (c) => {
  const userId = await currentUserId(c)
  if (!userId) return c.json({ user: null })
  const r = await pool.query(
    'select id, username, display from users where id = $1',
    [userId],
  )
  const row = r.rows[0]
  if (!row) return c.json({ user: null })
  return c.json({
    user: { id: Number(row.id), username: row.username, display: row.display },
  })
})

auth.post('/rename', async (c) => {
  const userId = await currentUserId(c)
  if (!userId) return c.json({ error: 'unauthorized' }, 401)

  const body = await c.req.json().catch(() => null)
  const { lower, raw } = readCreds(body)
  if (!USERNAME_RE.test(lower)) return c.json({ error: 'invalid_username' }, 400)
  if (isBanned(lower)) return c.json({ error: 'username_unavailable' }, 400)

  const dup = await pool.query(
    'select 1 from users where username = $1 and id <> $2',
    [lower, userId],
  )
  if (dup.rowCount) return c.json({ error: 'username_taken' }, 409)

  const r = await pool.query(
    'update users set username = $1, display = $2, renamed_at = now() where id = $3',
    [lower, raw || lower, userId],
  )
  if (!r.rowCount) return c.json({ error: 'unauthorized' }, 401)
  return c.json({ user: { id: userId, username: lower, display: raw || lower } })
})
