import { Hono } from 'hono'
import { pool } from '../db'

// 词表接口（公开：词库不是隐私数据，且前端启动时早于登录校验就要用）。
// 多语言：lang=en（CET/Oxford，中文释义） / lang=zh（HSK，英文释义）。缺省 en。
export const words = new Hono()

const langOf = (c: { req: { query: (k: string) => string | undefined } }) => {
  const l = c.req.query('lang')
  return l === 'zh' ? 'zh' : 'en'
}

/** 全量索引：word → tags[]，供前端筛选/计数。 */
words.get('/', async (c) => {
  const r = await pool.query<{ word: string; tags: string[] }>(
    'select word, tags from words where lang = $1 order by word',
    [langOf(c)],
  )
  const out: Record<string, string[]> = {}
  for (const row of r.rows) out[row.word] = row.tags ?? []
  return c.json(out)
})

/** 批量详情：?words=a,b,c → { word: { phonetic, pinyin, senses, audio, kind } }。 */
words.get('/details', async (c) => {
  const list = (c.req.query('words') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (list.length === 0) return c.json({})

  const r = await pool.query<{
    word: string
    phonetic: string | null
    pinyin: string | null
    senses: unknown
    audio: string | null
    kind: string | null
  }>(
    `select word, phonetic, pinyin, senses, audio, kind
       from words where lang = $1 and word = any($2::text[])`,
    [langOf(c), list],
  )

  const out: Record<string, unknown> = {}
  for (const row of r.rows) {
    out[row.word] = {
      phonetic: row.phonetic,
      pinyin: row.pinyin,
      senses: row.senses,
      audio: row.audio,
      kind: row.kind,
    }
  }
  return c.json(out)
})
