import type { TagFilter } from './filter'

/** 一本词书 */
export type Book = {
  id: number
  name: string
  filter: TagFilter
  count: number
}

const KEY = 'vocab-books'

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

function isBook(v: unknown): v is Book {
  if (typeof v !== 'object' || v === null) return false
  const b = v as Record<string, unknown>
  if (typeof b.id !== 'number' || typeof b.name !== 'string') return false
  if (typeof b.count !== 'number') return false
  const f = b.filter as Record<string, unknown> | undefined
  return !!f && isStringArray(f.include) && isStringArray(f.exclude)
}

export function loadBooks(): Book[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isBook) : []
  } catch {
    return []
  }
}

export function saveBooks(books: Book[]): void {
  localStorage.setItem(KEY, JSON.stringify(books))
}
