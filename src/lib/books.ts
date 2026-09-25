import type { TagFilter } from './filter'
import { sameFilter } from './filter'
import type { ContentLang } from './i18n'
import { isStringArray } from './guard'
import { readJSON, writeJSON } from './storage'
import { api } from './api'

/** 一本词书 */
export type Book = {
  id: number
  name: string
  filter: TagFilter
  /** 学习内容语言；旧数据没有，视为 'en' */
  lang?: ContentLang
  /** 是否是「当前在学」的那本（当前筛选的来路） */
  active?: boolean
}

/** 词书的语言（兼容旧数据） */
export function bookLang(b: Book): ContentLang {
  return b.lang === 'zh' ? 'zh' : 'en'
}

const KEY = 'vocab-books'

/** 词书数量上限 */
export const MAX_BOOKS = 3

function isBook(v: unknown): v is Book {
  if (typeof v !== 'object' || v === null) return false
  const b = v as Record<string, unknown>
  if (typeof b.id !== 'number' || typeof b.name !== 'string') return false
  const f = b.filter as Record<string, unknown> | undefined
  if (!f || !isStringArray(f.include) || !isStringArray(f.exclude)) return false
  return b.lang === undefined || b.lang === 'en' || b.lang === 'zh'
}

export function loadBooks(): Book[] {
  return (
    readJSON<Book[]>(KEY, (v) =>
      Array.isArray(v) ? v.filter(isBook) : [],
    ) ?? []
  )
}

let pushTimer: ReturnType<typeof setTimeout> | undefined
let pendingPush: Book[] | null = null

/** 写本地（保持同步读取），并 debounce 推服务器 */
export function saveBooks(books: Book[]): void {
  writeJSON(KEY, books)
  pendingPush = books
  if (pushTimer) return
  pushTimer = setTimeout(() => {
    pushTimer = undefined
    const b = pendingPush
    pendingPush = null
    if (b) void api.putBooks(b).catch(() => {})
  }, 500)
}

/** 登录后从服务器拉词书写入本地；服务器为空而本地有时，反推上去（首次迁移） */
export async function pullBooks(): Promise<void> {
  const res = await api.getBooks()
  const remote = Array.isArray(res.books) ? (res.books as Book[]) : []
  const local = loadBooks()
  if (remote.length === 0 && local.length > 0) {
    void api.putBooks(local).catch(() => {})
    return
  }
  writeJSON(KEY, remote)
}

/** 只清本地（登出用），不推服务器 */
export function clearBooksLocal(): void {
  writeJSON(KEY, [])
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
