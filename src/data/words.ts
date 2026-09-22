// 词库：运行时从 public/data/<lang>/ 加载，分两段。
//   1) loadIndex   → categories.json（word→tags）：Home/筛选够用
//   2) loadDetails → definitions.json + audio.json：补音标/释义/音频（卡片用）
// 中文以后放 public/data/zh/，接口带 lang 参数。
export type Sense = {
  /** 词性（已归一化，如 n. / v. / adj. / 其它） */
  pos: string
  defs: string[]
}

export type Word = {
  word: string
  tags: string[]
  /** 以下三项在 loadDetails 之前为空 */
  phonetic?: string
  senses?: Sense[]
  /** public/audio 下的文件名；缺音频的词没有 */
  audio?: string
}

let words: Word[] = []
const byName = new Map<string, Word>()
let detailsLoaded = false

/** 全部词（保持词库顺序）；loadIndex 完成前为空 */
export function allWords(): readonly Word[] {
  return words
}

/** 按单词查词条 */
export function findWord(name: string): Word | undefined {
  return byName.get(name)
}

/** 详情（音标/释义/音频）是否已加载 */
export function detailsReady(): boolean {
  return detailsLoaded
}

async function getJSON<T>(lang: string, file: string): Promise<T> {
  const url = `${import.meta.env.BASE_URL}data/${lang}/${file}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return (await res.json()) as T
}

/** 第一阶段：词 + 标签（应用启动时 await） */
export async function loadIndex(lang = 'en'): Promise<void> {
  const data = await getJSON<Record<string, unknown>>(lang, 'categories.json')
  words = []
  byName.clear()
  for (const [word, tags] of Object.entries(data)) {
    if (word === '_meta' || !Array.isArray(tags)) continue
    const w: Word = { word, tags: tags as string[] }
    words.push(w)
    byName.set(word, w)
  }
}

/** 第二阶段：补音标/释义/音频（进 Study/Quiz 时；幂等，合并进已有对象） */
let detailsPromise: Promise<void> | null = null

export function loadDetails(lang = 'en'): Promise<void> {
  if (!detailsPromise) detailsPromise = doLoadDetails(lang)
  return detailsPromise
}

async function doLoadDetails(lang: string): Promise<void> {
  const [defs, audio] = await Promise.all([
    getJSON<Record<string, unknown>>(lang, 'definitions.json'),
    getJSON<Record<string, string>>(lang, 'audio.json'),
  ])
  for (const w of words) {
    const d = defs[w.word]
    if (Array.isArray(d) && d.length === 2) {
      const [phonetic, groups] = d as [string, [string, string[]][]]
      w.phonetic = phonetic
      w.senses = groups.map(([pos, ds]) => ({ pos, defs: ds }))
    }
    const a = audio[w.word]
    if (typeof a === 'string') w.audio = a
  }
  detailsLoaded = true
}
