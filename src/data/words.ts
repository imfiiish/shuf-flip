// 词库：从后端 API 加载，分两段（数据在数据库 words 表里）。
//   1) loadIndex   → GET /api/words?lang=…              word→tags：Home/筛选/计数够用
//   2) loadDetails → GET /api/words/details?lang=…&words=… 音标/释义/音频：按需、分批
//
// 现在中英两套词库都加载进同一份 store（各带 lang），因为 tag 选择器会同时
// 展示两种语言的 tag 组，学习方向由所选 tag（=词书 lang）决定。
// 音频：DB 只存文件名；播放时再按「语言 + 口音」拼目录（en / zh/cn 普通话 / zh/hk 粤语）。
import type { Accent, ContentLang } from '../lib/i18n'

export type Sense = {
  /** 词性（en 显示，如 n./v.；zh 存着但不显示，如 动/名） */
  pos: string
  defs: string[]
}

/** 中文音频口音：cn=普通话，hk=粤语 */

export type Word = {
  word: string
  tags: string[]
  /** 该词属于哪套词库 */
  lang: ContentLang
  /** 以下字段在 loadDetails 覆盖到该词之前为空 */
  phonetic?: string
  /** zh: 拼音（en 无，用 phonetic） */
  pinyin?: string
  senses?: Sense[]
  /** 音频文件名（不含目录）；缺音频的词没有 */
  audio?: string
  /** zh: 'char' | 'word' | 'both' */
  kind?: string
}

/** 全部词（en + zh，各自保持接口返回顺序）；loadIndex 完成前为空 */
let words: Word[] = []
/** word → 词条（两套词库合并；词名不冲突） */
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

/** 单词音频的相对路径（不含 audio/ 前缀）；按语言 + 口音拼目录 */
export function wordAudio(
  word: Word | null | undefined,
  accent: Accent = 'cn',
): string | undefined {
  if (!word?.audio) return undefined
  const dir = word.lang === 'en' ? 'en' : `zh/${accent}`
  return `${dir}/${word.audio}`
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return (await res.json()) as T
}

/** 第一阶段：加载某语言的「词 + 标签」；重复调用会替换该语言 */
export async function loadIndex(lang: ContentLang): Promise<void> {
  const data = await getJSON<Record<string, unknown>>(
    `/api/words?lang=${lang}`,
  )
  // 去掉该语言的旧词，再整体重灌（保持 en/zh 各自顺序）
  words = words.filter((w) => w.lang !== lang)
  const next: Word[] = []
  for (const [word, tags] of Object.entries(data)) {
    const w: Word = {
      word,
      tags: Array.isArray(tags) ? (tags as string[]) : [],
      lang,
    }
    next.push(w)
    byName.set(word, w)
  }
  if (lang === 'zh') words = [...words, ...next]
  else words = [...next, ...words]
}

/** 第一阶段：加载中英两套词库 */
export async function loadAllIndices(): Promise<void> {
  await Promise.all([loadIndex('en'), loadIndex('zh')])
}

type Detail = {
  phonetic?: unknown
  pinyin?: unknown
  senses?: unknown
  audio?: unknown
  kind?: unknown
}

/**
 * 第二阶段：按需补音标/释义/音频（幂等，合并进已有对象）。
 * 按词所属语言分组请求；只请求还没拉过的词；失败不抛、留待下次重试。
 */
export async function loadDetails(names: readonly string[]): Promise<void> {
  const byLang: Record<ContentLang, string[]> = { en: [], zh: [] }
  for (const n of new Set(names)) {
    const w = byName.get(n)
    if (!w || detailed.has(n)) continue
    byLang[w.lang].push(n)
  }

  await Promise.all(
    (['en', 'zh'] as ContentLang[]).map(async (lang) => {
      const need = byLang[lang]
      if (need.length === 0) return
      try {
        const data = await getJSON<Record<string, Detail>>(
          `/api/words/details?lang=${lang}&words=${encodeURIComponent(need.join(','))}`,
        )
        for (const [word, d] of Object.entries(data)) {
          const w = byName.get(word)
          if (!w) continue
          if (typeof d.phonetic === 'string') w.phonetic = d.phonetic
          if (typeof d.pinyin === 'string') w.pinyin = d.pinyin
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
          // 只存文件名，目录在播放时按口音拼
          if (typeof d.audio === 'string') w.audio = d.audio
          if (typeof d.kind === 'string') w.kind = d.kind
        }
        for (const n of need) detailed.add(n)
      } catch {
        // 网络失败：不标记 detailed，下次再试；调用方照常放行
      }
    }),
  )
}
