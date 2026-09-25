// 把 seed/words.sql 灌进数据库（先清空 words，再整体加载）。
//
// 用 psql 而非 pg 驱动：seed 是 pg_dump 的 COPY 格式，psql 原生支持。
// DATABASE_URL 由 `node --env-file-if-exists=.env` 注入。
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const seedFile = resolve(here, '../seed/words.sql')
const url = process.env.DATABASE_URL

if (!url) {
  console.error('[seed] DATABASE_URL 未设置')
  process.exit(1)
}

// -1：整个文件一个事务（truncate + copy 原子）；ON_ERROR_STOP：出错即停
const r = spawnSync(
  'psql',
  [url, '-v', 'ON_ERROR_STOP=1', '-1', '-c', 'truncate words', '-f', seedFile],
  { stdio: 'inherit' },
)

if (r.error) {
  console.error('[seed] 调用 psql 失败：', r.error.message)
  process.exit(1)
}
process.exit(r.status ?? 1)
