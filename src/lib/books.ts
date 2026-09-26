import type { TagFilter } from './filter'
import type { Accent, ContentLang } from './i18n'
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
  /** 中文发音口音；旧数据/英文没有，视为普通话 'cn' */
  accent?: Accent
  /** 是否是「当前在学」的那本（当前筛选的来路） */
  active?: boolean
}

/** 词书的语言（兼容旧数据） */
export function bookLang(b: Book): ContentLang {
  return b.lang === 'zh' ? 'zh' : 'en'
}

/** 词书的中文口音（兼容旧数据） */
export function bookAccent(b: Book): Accent {
  return b.accent === 'hk' ? 'hk' : 'cn'
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
  if (b.lang !== undefined && b.lang !== 'en' && b.lang !== 'zh') return false
  if (b.accent !== undefined && b.accent !== 'cn' && b.accent !== 'hk')
    return false
  return true
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

/** 把指定 id 的词书设为当前（同 filter 不同口音也能区分） */
export function setActiveBook(id: number): void {
  const books = loadBooks()
  if (!books.some((b) => b.id === id)) return
  saveBooks(books.map((b) => ({ ...b, active: b.id === id })))
}
