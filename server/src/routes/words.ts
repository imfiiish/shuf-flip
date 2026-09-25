import { Hono } from 'hono'
import { pool } from '../db'

// 词表接口（公开：词库不是隐私数据，且前端启动时早于登录校验就要用）。
export const words = new Hono()

/** 全量索引：word → tags[]，供前端筛选/计数。 */
words.get('/', async (c) => {
  const r = await pool.query<{ word: string; tags: string[] }>(
    'select word, tags from words order by word',
  )
  const out: Record<string, string[]> = {}
  for (const row of r.rows) out[row.word] = row.tags ?? []
  return c.json(out)
})

/** 批量详情：?words=a,b,c → { word: { phonetic, senses, audio } }。 */
words.get('/details', async (c) => {
  const list = (c.req.query('words') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (list.length === 0) return c.json({})

  const r = await pool.query<{
    word: string
    phonetic: string | null
    senses: unknown
    audio: string | null
  }>(
    'select word, phonetic, senses, audio from words where word = any($1::text[])',
    [list],
  )

  const out: Record<
    string,
    { phonetic: string | null; senses: unknown; audio: string | null }
  > = {}
  for (const row of r.rows) {
    out[row.word] = {
      phonetic: row.phonetic,
      senses: row.senses,
      audio: row.audio,
    }
  }
  return c.json(out)
})
