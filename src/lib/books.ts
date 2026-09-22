import type { TagFilter } from './filter'
import { sameFilter } from './filter'
import { isStringArray } from './guard'
import { readJSON, writeJSON } from './storage'

/** 一本词书 */
export type Book = {
  id: number
  name: string
  filter: TagFilter
  /** 是否是「当前在学」的那本（当前筛选的来路） */
  active?: boolean
}

const KEY = 'vocab-books'

/** 词书数量上限 */
export const MAX_BOOKS = 3

function isBook(v: unknown): v is Book {
  if (typeof v !== 'object' || v === null) return false
  const b = v as Record<string, unknown>
  if (typeof b.id !== 'number' || typeof b.name !== 'string') return false
  const f = b.filter as Record<string, unknown> | undefined
  return !!f && isStringArray(f.include) && isStringArray(f.exclude)
}

export function loadBooks(): Book[] {
  return (
    readJSON<Book[]>(KEY, (v) =>
      Array.isArray(v) ? v.filter(isBook) : [],
    ) ?? []
  )
}

export function saveBooks(books: Book[]): void {
  writeJSON(KEY, books)
}

/** 当前在学那本的筛选（没有 active 则 null） */
export function activeFilter(books: Book[]): TagFilter | null {
  return books.find((b) => b.active)?.filter ?? null
}

/** 把与 filter 相同的那本书设为当前（没有匹配的书则不动） */
export function setActiveFilter(filter: TagFilter): void {
  const books = loadBooks()
  if (!books.some((b) => sameFilter(b.filter, filter))) return
  const next = books.map((b) => ({ ...b, active: sameFilter(b.filter, filter) }))
  saveBooks(next)
}
