import type { Word } from './words'

/** 选中 tag 的两态：包含 / 排除（不选 = 不在 map 里） */
export type TagMode = 'include' | 'exclude'

export type TagFilter = {
  include: string[]
  exclude: string[]
}

// 与 index.html / theme.ts 一样，用 localStorage 暂存
const KEY = 'vocab-filter'

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export function loadFilter(): TagFilter {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { include: [], exclude: [] }
    const p = JSON.parse(raw) as { include?: unknown; exclude?: unknown }
    return { include: asStringArray(p?.include), exclude: asStringArray(p?.exclude) }
  } catch {
    return { include: [], exclude: [] }
  }
}

export function saveFilter(f: TagFilter): void {
  localStorage.setItem(KEY, JSON.stringify(f))
}

/** 过滤规则：排除优先；没选包含 tag 时从全部开始；包含之间是 OR */
export function matchesFilter(word: Word, f: TagFilter): boolean {
  if (f.exclude.length > 0 && word.tags.some((t) => f.exclude.includes(t))) {
    return false
  }
  if (f.include.length === 0) return true
  return word.tags.some((t) => f.include.includes(t))
}

/** 两个筛选条件是否等价（include / exclude 都按集合比较，与顺序无关） */
export function sameFilter(a: TagFilter, b: TagFilter): boolean {
  const key = (f: TagFilter) =>
    `i:${[...f.include].sort().join(',')}|e:${[...f.exclude].sort().join(',')}`
  return key(a) === key(b)
}
