import pg from 'pg'
import { env } from './env'

// bigint（bigserial）默认以字符串返回，避免超过 JS 安全整数；这里显式转 number
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)))

export const pool = new pg.Pool({ connectionString: env.databaseUrl })
