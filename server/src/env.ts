import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// 加载 server/.env（存在才加载；缺省用默认值）
const envPath = resolve(import.meta.dirname, '../.env')
if (existsSync(envPath)) process.loadEnvFile(envPath)

function num(v: string | undefined, d: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

export const env = {
  port: num(process.env.PORT, 3001),
  databaseUrl:
    process.env.DATABASE_URL ?? 'postgres://shuf:shuf@localhost:5432/shuf',
  /** 会话有效期（天），滚动续期 */
  sessionTtlDays: num(process.env.SESSION_TTL_DAYS, 90),
  cookieName: process.env.COOKIE_NAME ?? 'sf_sid',
  /** 生产 https 下启用 Secure Cookie */
  secureCookies: process.env.NODE_ENV === 'production',
}
