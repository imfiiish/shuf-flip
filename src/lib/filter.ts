import type { Word } from '../data/words'
import { allWords } from '../data/words'
import { readJSON, writeJSON } from './storage'

/** 选中 tag 的两态：包含 / 排除（不选 = 不在 map 里） */
export type TagMode = 'include' | 'exclude'

export type TagFilter = {
  include: string[]
  exclude: string[]
}

const KEY = 'vocab-filter'

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export function loadFilter(): TagFilter {
  return (
    readJSON<TagFilter>(KEY, (v) => {
      const p = v as { include?: unknown; exclude?: unknown } | null
      return {
        include: asStringArray(p?.include),
        exclude: asStringArray(p?.exclude),
      }
    }) ?? { include: [], exclude: [] }
  )
}

export function saveFilter(f: TagFilter): void {
  writeJSON(KEY, f)
}

/** 过滤规则：排除优先；没选包含 tag 时从全部开始；包含之间是 OR */
export function matchesFilter(word: Word, f: TagFilter): boolean {
  if (f.exclude.length > 0 && word.tags.some((t) => f.exclude.includes(t))) {
    return false
  }
  if (f.include.length === 0) return true
  return word.tags.some((t) => f.include.includes(t))
}

/** 筛选条件的稳定 key，用于区分不同词书 / 定位存储 */
export function filterKey(f: TagFilter): string {
  return `i:${[...f.include].sort().join(',')}|e:${[...f.exclude].sort().join(',')}`
}

/** 当前筛选下的词池（word 字符串数组，保持词库顺序） */
export function poolOf(f: TagFilter): string[] {
  return allWords()
    .filter((w) => matchesFilter(w, f))
    .map((w) => w.word)
}

/** 两个筛选条件是否等价（include / exclude 都按集合比较，与顺序无关） */
export function sameFilter(a: TagFilter, b: TagFilter): boolean {
  return filterKey(a) === filterKey(b)
}
