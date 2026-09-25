// 把 seed/words*.sql 灌进数据库（先清空 words，再整体加载）。
//
// 用 psql 而非 pg 驱动：seed 是 pg_dump / COPY 格式，psql 原生支持。
// words.sql = 英文（lang 缺省 'en'），words_zh.sql = 中文（lang='zh'）。
// DATABASE_URL 由 `node --env-file-if-exists=.env` 注入。
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readdirSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const seedDir = resolve(here, '../seed')
const files = readdirSync(seedDir)
  .filter((f) => /^words.*\.sql$/.test(f))
  .sort()
  .map((f) => resolve(seedDir, f))
const url = process.env.DATABASE_URL

if (!url) {
  console.error('[seed] DATABASE_URL 未设置')
  process.exit(1)
}
if (files.length === 0) {
  console.error('[seed] seed/ 下没有 words*.sql')
  process.exit(1)
}

// -1：整个文件一个事务（truncate + copy 原子）；ON_ERROR_STOP：出错即停
const r = spawnSync(
  'psql',
  [
    url,
    '-v',
    'ON_ERROR_STOP=1',
    '-1',
    '-c',
    'truncate words',
    ...files.flatMap((f) => ['-f', f]),
  ],
  { stdio: 'inherit' },
)

if (r.error) {
  console.error('[seed] 调用 psql 失败：', r.error.message)
  process.exit(1)
}
process.exit(r.status ?? 1)
