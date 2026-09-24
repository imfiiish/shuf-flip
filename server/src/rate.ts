import { pool } from './db'

// 服务端限速：4 位密码熵低，必须防在线爆破。
// 规则：15 分钟内失败 >= 5 次 → 指数退避（30s、60s、120s… 上限 1h）。
// 同时看 username 和 ip，避免只锁用户名被人恶意锁号（DoS）。
const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILS = 5
const BASE_LOCK_MS = 30_000
const MAX_LOCK_MS = 60 * 60 * 1000

export type Gate = { ok: true } | { ok: false; retryAfter: number }

export async function checkLogin(username: string, ip: string): Promise<Gate> {
  const since = new Date(Date.now() - WINDOW_MS)
  const res = await pool.query(
    `select ts from login_fail
      where (username = $1 or ip = $2) and ts > $3
      order by ts desc`,
    [username, ip, since],
  )
  const fails = res.rows.length
  if (fails < MAX_FAILS) return { ok: true }

  const last = new Date(res.rows[0].ts).getTime()
  const over = fails - MAX_FAILS
  const lockMs = Math.min(BASE_LOCK_MS * 2 ** over, MAX_LOCK_MS)
  const retryAfter = Math.ceil((last + lockMs - Date.now()) / 1000)
  return retryAfter > 0 ? { ok: false, retryAfter } : { ok: true }
}

export async function recordFail(username: string, ip: string): Promise<void> {
  await pool.query('insert into login_fail (username, ip) values ($1, $2)', [
    username,
    ip,
  ])
}

export async function clearFail(username: string): Promise<void> {
  await pool.query('delete from login_fail where username = $1', [username])
}
