// 词库：从后端 API 加载，分两段（数据在数据库 words 表里）。
//   1) loadIndex   → GET /api/words                 word→tags：Home/筛选/计数够用
//   2) loadDetails → GET /api/words/details?words=… 音标/释义/音频：按需、分批
export type Sense = {
  /** 词性（已归一化，如 n. / v. / adj. / 其它） */
  pos: string
  defs: string[]
}

export type Word = {
  word: string
  tags: string[]
  /** 以下三项在 loadDetails 覆盖到该词之前为空 */
  phonetic?: string
  senses?: Sense[]
  /** public/audio 下的文件名；缺音频的词没有 */
  audio?: string
}

let words: Word[] = []
const byName = new Map<string, Word>()
/** 已拉过详情的词（含「确认没有详情」的），避免重复请求 */
const detailed = new Set<string>()

/** 全部词（保持接口返回顺序）；loadIndex 完成前为空 */
export function allWords(): readonly Word[] {
  return words
}

/** 按单词查词条 */
export function findWord(name: string): Word | undefined {
  return byName.get(name)
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return (await res.json()) as T
}

/** 第一阶段：词 + 标签（应用启动时 await） */
export async function loadIndex(): Promise<void> {
  const data = await getJSON<Record<string, unknown>>('/api/words')
  words = []
  byName.clear()
  detailed.clear()
  for (const [word, tags] of Object.entries(data)) {
    const w: Word = {
      word,
      tags: Array.isArray(tags) ? (tags as string[]) : [],
    }
    words.push(w)
    byName.set(word, w)
  }
}

type Detail = {
  phonetic?: unknown
  senses?: unknown
  audio?: unknown
}

/**
 * 第二阶段：按需补音标/释义/音频（幂等，合并进已有对象）。
 * 只请求还没拉过的词；失败不抛、留待下次重试，UI 不会被卡住。
 */
export async function loadDetails(names: readonly string[]): Promise<void> {
  const need = [...new Set(names)].filter(
    (n) => byName.has(n) && !detailed.has(n),
  )
  if (need.length === 0) return

  try {
    const data = await getJSON<Record<string, Detail>>(
      `/api/words/details?words=${encodeURIComponent(need.join(','))}`,
    )
    for (const [word, d] of Object.entries(data)) {
      const w = byName.get(word)
      if (!w) continue
      if (typeof d.phonetic === 'string') w.phonetic = d.phonetic
      if (Array.isArray(d.senses)) {
        w.senses = (d.senses as [string, string[]][])
          .filter(
            (s) =>
              Array.isArray(s) &&
              typeof s[0] === 'string' &&
              Array.isArray(s[1]),
          )
          .map(([pos, defs]) => ({ pos, defs }))
      }
      if (typeof d.audio === 'string') w.audio = d.audio
    }
    for (const n of need) detailed.add(n)
  } catch {
    // 网络失败：不标记 detailed，下次再试；调用方照常放行
  }
}
