import type { Word } from '../data/words'
import { allWords } from '../data/words'
import type { ContentLang } from './i18n'

/** 选中 tag 的两态：包含 / 排除（不选 = 不在 map 里） */
export type TagMode = 'include' | 'exclude'

export type TagFilter = {
  include: string[]
  exclude: string[]
}

/** 过滤规则：排除优先；没选包含 tag 时从全部开始；包含之间是 OR */
export function matchesFilter(word: Word, f: TagFilter): boolean {
  if (f.exclude.length > 0 && word.tags.some((t) => f.exclude.includes(t))) {
    return false
  }
  if (f.include.length === 0) return true
  return word.tags.some((t) => f.include.includes(t))
}

/** 筛选条件的稳定 key（`l:zh|i:…|e:…`），用于区分词书 / 定位存储；含学习语言 */
export function filterKey(f: TagFilter, lang: ContentLang): string {
  return `l:${lang}|i:${[...f.include].sort().join(',')}|e:${[...f.exclude].sort().join(',')}`
}

/** 忽略语言、只比 include/exclude（同一学习方向内比较用） */
function tagKey(f: TagFilter): string {
  return `i:${[...f.include].sort().join(',')}|e:${[...f.exclude].sort().join(',')}`
}

/** filterKey 的反解（tag 名里不含 , 和 |）；lang 前缀若存在则忽略 */
export function filterFromKey(key: string): TagFilter {
  const rest = key.replace(/^l:[a-z]+\|/, '')
  const [inc = '', exc = ''] = rest.replace(/^i:/, '').split('|e:')
  const split = (s: string) => (s ? s.split(',') : [])
  return { include: split(inc), exclude: split(exc) }
}

/** 当前筛选下的词池（word 字符串数组，保持词库顺序） */
export function poolOf(f: TagFilter): string[] {
  return allWords()
    .filter((w) => matchesFilter(w, f))
    .map((w) => w.word)
}

/** 两个筛选条件是否等价（只比 tag，与语言/顺序无关） */
export function sameFilter(a: TagFilter, b: TagFilter): boolean {
  return tagKey(a) === tagKey(b)
}
