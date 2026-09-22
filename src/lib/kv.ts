// 持久层：优先 IndexedDB，不可用（隐私模式等）回退 localStorage。
//
// 设计：所有状态模块把自己的缓存 hydrate 进内存，读同步走内存；
// 写走 put/del 进入队列、抖动合并后异步落盘（结构化克隆，不 JSON 序列化）。
// 按「更新粒度」分 store，改一条不碰其它：
//   cascade      key=filterKey  一本词书一条
//   centers      key=filterKey  一本词书一条
//   coverage     key=word       1=碰到
//   revealDay    key=date       当天 {word: n}（每天分开、永久保留；总次数由各天汇总）
//   misc         key            quiz 等零散
const STORES = [
  'cascade',
  'centers',
  'coverage',
  'revealDay',
  'misc',
] as const
type StoreName = (typeof STORES)[number]

let useIdb = true
let db: IDBDatabase | null = null

const FB_PREFIX = 'vocab-fb-'

function fallbackRead(s: StoreName): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(FB_PREFIX + s) ?? '{}') as Record<
      string,
      unknown
    >
  } catch {
    return {}
  }
}

function fallbackWrite(s: StoreName, obj: Record<string, unknown>): void {
  try {
    localStorage.setItem(FB_PREFIX + s, JSON.stringify(obj))
  } catch {
    /* 配额/隐私模式：静默 */
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('vocab', 2)
    req.onupgradeneeded = () => {
      const d = req.result
      for (const s of STORES) {
        if (!d.objectStoreNames.contains(s)) d.createObjectStore(s)
      }
      // v2：删掉废弃的 revealTotal（总次数改为由 revealDay 汇总）
      if (d.objectStoreNames.contains('revealTotal')) {
        d.deleteObjectStore('revealTotal')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** 初始化（应用启动、hydrate 之前调用一次） */
export async function initKV(): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    useIdb = false
    return
  }
  try {
    db = await openDB()
  } catch {
    useIdb = false
    db = null
  }
}

/** 读取整个 store（hydrate 用） */
export function loadStore(s: StoreName): Promise<Record<string, unknown>> {
  if (useIdb && db) {
    return new Promise((resolve, reject) => {
      const t = db!.transaction(s, 'readonly')
      const cur = t.objectStore(s).openCursor()
      const out: Record<string, unknown> = {}
      cur.onsuccess = () => {
        const c = cur.result
        if (c) {
          out[String(c.key)] = c.value
          c.continue()
        } else {
          resolve(out)
        }
      }
      cur.onerror = () => reject(cur.error)
    })
  }
  return Promise.resolve(fallbackRead(s))
}

/** 读取某 store 的所有 key（不取值） */
export function loadKeys(s: StoreName): Promise<string[]> {
  if (useIdb && db) {
    return new Promise((resolve, reject) => {
      const req = db!.transaction(s, 'readonly').objectStore(s).getAllKeys()
      req.onsuccess = () => resolve(req.result.map(String))
      req.onerror = () => reject(req.error)
    })
  }
  return Promise.resolve(Object.keys(fallbackRead(s)))
}

/** 读取单个 key */
export function getKV<T>(s: StoreName, key: string): Promise<T | undefined> {
  if (useIdb && db) {
    return new Promise((resolve, reject) => {
      const req = db!.transaction(s, 'readonly').objectStore(s).get(key)
      req.onsuccess = () => resolve(req.result as T | undefined)
      req.onerror = () => reject(req.error)
    })
  }
  return Promise.resolve(fallbackRead(s)[key] as T | undefined)
}

type Op = { store: StoreName; key: string; value?: unknown; del?: boolean }

/** 待写队列（按 store+key 去重，后写覆盖先写） */
const pending = new Map<string, Op>()
let timer: ReturnType<typeof setTimeout> | undefined

function schedule(): void {
  if (timer !== undefined) return
  timer = setTimeout(() => {
    timer = undefined
    void flush()
  }, 400)
}

export function put(store: StoreName, key: string, value: unknown): void {
  pending.set(`${store}\u0000${key}`, { store, key, value })
  schedule()
}

export function del(store: StoreName, key: string): void {
  pending.set(`${store}\u0000${key}`, { store, key, del: true })
  schedule()
}

const txDone = (t: IDBTransaction) =>
  new Promise<void>((resolve) => {
    t.oncomplete = () => resolve()
    t.onerror = () => resolve()
    t.onabort = () => resolve()
  })

/** 立即落盘（页面隐藏/卸载前调用） */
export async function flush(): Promise<void> {
  if (timer !== undefined) {
    clearTimeout(timer)
    timer = undefined
  }
  if (pending.size === 0) return
  const ops = [...pending.values()]
  pending.clear()

  const byStore = new Map<StoreName, Op[]>()
  for (const op of ops) {
    const list = byStore.get(op.store)
    if (list) list.push(op)
    else byStore.set(op.store, [op])
  }

  if (useIdb && db) {
    for (const [store, list] of byStore) {
      const t = db.transaction(store, 'readwrite')
      const os = t.objectStore(store)
      for (const op of list) {
        if (op.del) os.delete(op.key)
        else os.put(op.value, op.key)
      }
      await txDone(t)
    }
    return
  }

  // 回退：localStorage 整 store 读改写
  for (const [store, list] of byStore) {
    const obj = fallbackRead(store)
    for (const op of list) {
      if (op.del) delete obj[op.key]
      else obj[op.key] = op.value
    }
    fallbackWrite(store, obj)
  }
}
