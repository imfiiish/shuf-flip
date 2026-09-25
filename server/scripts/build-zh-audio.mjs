// 用 edge-tts 给中文词条生成发音，写回 words.audio（形如 'zh/<hash>.mp3'）。
//
// 前置：pip install edge-tts（或 uv tool install edge-tts），命令行里能用 edge-tts。
// 可续跑：已存在的 mp3 跳过，只补新词。多音字/词按词面朗读，可能读错读音，
// 自用够；要精确可按读音单独生成并在 words 里指定文件。
//
// 用法：
//   npm run audio:zh                 # 全部 zh 词条
//   ZH_VOICE=zh-CN-YunxiNeural npm run audio:zh
//   ZH_LIMIT=20 npm run audio:zh     # 只跑前 20 个（试听/调试）
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '../../public/audio/zh')
const voice = process.env.ZH_VOICE ?? 'zh-CN-XiaoxiaoNeural'
const limit = Number(process.env.ZH_LIMIT ?? 0)
const concurrency = Math.max(1, Number(process.env.ZH_CONCURRENCY ?? 4))
const url = process.env.DATABASE_URL

if (!url) {
  console.error('[audio:zh] DATABASE_URL 未设置（用 node --env-file-if-exists=.env 启动）')
  process.exit(1)
}

const probe = spawnSync('edge-tts', ['--version'], { encoding: 'utf8' })
if (probe.error || probe.status !== 0) {
  console.error('[audio:zh] 找不到 edge-tts，请先 `pip install edge-tts`')
  process.exit(1)
}

const fileOf = (word) =>
  `zh-${createHash('sha1').update(`zh:${word}`).digest('hex').slice(0, 10)}.mp3`

const pool = new pg.Pool({ connectionString: url })
const { rows } = await pool.query(
  `select word from words where lang = 'zh' order by word`,
)
mkdirSync(outDir, { recursive: true })

const todo = rows.filter((r) => !existsSync(resolve(outDir, fileOf(r.word))))
if (limit > 0) todo.length = Math.min(todo.length, limit)
console.log(
  `[audio:zh] 共 ${rows.length} 词，已存在 ${rows.length - todo.length}，待生成 ${todo.length}（voice=${voice}）`,
)

const done = []
let failed = 0
let idx = 0

async function worker() {
  while (idx < todo.length) {
    const { word } = todo[idx++]
    const filename = fileOf(word)
    const out = resolve(outDir, filename)
    const r = spawnSync(
      'edge-tts',
      ['--voice', voice, '--text', word, '--write-media', out],
      { encoding: 'utf8' },
    )
    if (r.status === 0 && existsSync(out)) {
      done.push({ word, audio: `zh/${filename}` })
      if (done.length % 50 === 0) console.log(`[audio:zh] 已完成 ${done.length}`)
    } else {
      failed++
      if (failed <= 10) console.error(`[audio:zh] 失败 ${word}: ${r.stderr?.trim()}`)
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, worker))

// 批量回写音频文件名
for (let i = 0; i < done.length; i += 500) {
  const batch = done.slice(i, i + 500)
  const values = batch
    .map((_, j) => `($${j * 2 + 1}::text, $${j * 2 + 2}::text)`)
    .join(',')
  const params = batch.flatMap((d) => [d.word, d.audio])
  await pool.query(
    `update words set audio = v.audio, updated_at = now()
       from (values ${values}) as v(word, audio)
      where words.lang = 'zh' and words.word = v.word`,
    params,
  )
}

console.log(`[audio:zh] 完成 ${done.length}，失败 ${failed} → ${outDir}`)
await pool.end()
