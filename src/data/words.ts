// 词库：运行时从 public/data/<lang>/words.json 加载。
// 数据由 sources 生成；中文以后放 public/data/zh/，加载器带 lang 参数。
export type Sense = {
  /** 词性（已归一化，如 n. / v. / adj. / 其它） */
  pos: string
  defs: string[]
}

export type Word = {
  word: string
  phonetic: string
  senses: Sense[]
  tags: string[]
  /** public/audio 下的文件名；缺音频的词没有此字段 */
  audio?: string
}

let cache: Word[] = []
let byName = new Map<string, Word>()

/** 全部词（保持词库顺序）；loadWords 完成前为空数组 */
export function allWords(): readonly Word[] {
  return cache
}

/** 按单词查词条 */
export function findWord(name: string): Word | undefined {
  return byName.get(name)
}

/** 加载词库（应用启动时 await 一次） */
export async function loadWords(lang = 'en'): Promise<void> {
  const url = `${import.meta.env.BASE_URL}data/${lang}/words.json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  const data = (await res.json()) as { words?: Word[] }
  if (!Array.isArray(data.words)) throw new Error(`词库格式错误: ${url}`)
  cache = data.words
  byName = new Map(cache.map((w) => [w.word, w]))
}
