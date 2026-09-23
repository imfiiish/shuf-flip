// 一轮的抽样逻辑：级联窗口（见 docs/sampling.md）
//
// 每轮只从「活跃窗口」（最小池，WINDOW 个词）里均匀抽 ROUND_SIZE 个；
// 活跃窗口每 WINDOW_ROUNDS 轮从上一级重抽一次，逐级 ×GROW 大小、周期 ×MULT，
// 一直到整个词池。好处：短期锁住较高的重复率，长期又能覆盖全部词。
import { loadStore, put, del } from './kv'
import { pick } from './random'
import { isStringArray } from './guard'

/** 每轮抽取的词数 */
export const ROUND_SIZE = 16

/** 活跃窗口（最小池）大小 */
const WINDOW = 64

/** 活跃窗口寿命（轮）：每这么多轮，活跃窗口从上一级重抽一次 */
export const WINDOW_ROUNDS = 8

/** 每级窗口的词数倍率：64 → 256 → 1024 … */
const GROW = 4

/** 每级周期倍率：第 i 级周期 = WINDOW_ROUNDS × MULT^i（与 GROW 解耦） */
const MULT = 3

/** 一本词书的级联状态（按 filterKey 持久化） */
export type Cascade = {
  /** 下一轮要画的序号（0 起） */
  r: number
  /** levels[0] = 活跃窗口；…；levels[last] = 整个词池 */
  levels: string[][]
  /** 当前显示的这一轮（ROUND_SIZE 个词） */
  round: string[]
}

/**
 * 级联链：从 WINDOW 起每级 ×GROW，最后接 N。
 * 顶部最后一跳若超过 2×，补一个「半池」级把它压到 ≤2×；
 * 但半池级离 N 太近（不足 last/4）就不补，免得出现几乎一样的两级。
 * 例：N=2000 → [64,256,1024,2000]；N=4096 → [64,256,1024,2048,4096]
 */
function chainOf(n: number): number[] {
  if (n <= WINDOW) return [n]
  const c: number[] = []
  for (let s = WINDOW; s < n; s *= GROW) c.push(s)
  const last = c[c.length - 1]
  if (n > 2 * last && n - 2 * last >= last / 4) c.push(2 * last)
  c.push(n)
  return c
}

/** 第 i 级窗口的周期（轮） */
function periodOf(i: number): number {
  return WINDOW_ROUNDS * MULT ** i
}

/** 全新级联：顶层 = 整个池，逐级均匀抽下去 */
function freshLevels(pool: readonly string[]): string[][] {
  const chain = chainOf(pool.length)
  const levels: string[][] = new Array(chain.length)
  levels[chain.length - 1] = [...pool]
  for (let i = chain.length - 2; i >= 0; i--) {
    levels[i] = pick(levels[i + 1], chain[i])
  }
  return levels
}

/**
 * 用当前池校准已存级联：各层保留仍在父级里的词（原顺序），再按父级顺序补足到目标大小。
 * 链的长度变了（说明池子大变）→ 直接重建。
 */
function fitLevels(stored: string[][] | null, pool: readonly string[]): string[][] {
  const chain = chainOf(pool.length)
  if (!stored || stored.length !== chain.length) return freshLevels(pool)
  const levels: string[][] = new Array(chain.length)
  levels[chain.length - 1] = [...pool]
  for (let i = chain.length - 2; i >= 0; i--) {
    const parent = levels[i + 1]
    const parentSet = new Set(parent)
    const size = Math.min(chain[i], parent.length)
    const seen = new Set<string>()
    const out: string[] = []
    for (const w of stored[i] ?? []) {
      if (out.length >= size) break
      if (parentSet.has(w) && !seen.has(w)) {
        seen.add(w)
        out.push(w)
      }
    }
    // 补足槽位：从「父级里尚未保留的」中均匀抽，而不是顺着父级顺序取前几个。
    // 父级顺序 = 旧词在前、新词（词库靠后）在后；顺取会系统性偏向旧词/靠前的词，
    // 使新词迟迟进不了下级，且结果依赖词库排列顺序。
    if (out.length < size) {
      const rest: string[] = []
      for (const w of parent) {
        if (!seen.has(w)) {
          seen.add(w)
          rest.push(w)
        }
      }
      out.push(...pick(rest, size - out.length))
    }
    levels[i] = out
  }
  return levels
}

/** 前进一轮：按周期刷新各级（先高后低），再从活跃窗口抽 ROUND_SIZE 个 */
export function advance(c: Cascade, pool: readonly string[]): Cascade {
  const chain = chainOf(pool.length)
  const levels = c.levels.map((l) => [...l])
  const r = c.r
  if (r > 0) {
    for (let i = levels.length - 2; i >= 0; i--) {
      if (r % periodOf(i) === 0) {
        levels[i] = pick(levels[i + 1] ?? pool, chain[i])
      }
    }
  }
  const win = levels[0] ?? [...pool]
  return { r: r + 1, levels, round: pick(win, ROUND_SIZE) }
}

/**
 * 读一本词书的级联：没存档就新建并画第一轮；有存档则按当前池校准、沿用存档里那一轮。
 * 返回的 round 就是「本轮」。
 */
export function ensureCascade(key: string, pool: readonly string[]): Cascade {
  const stored = loadCascade(key)
  const levels = fitLevels(stored?.levels ?? null, pool)
  const poolSet = new Set(pool)
  const round = (stored?.round ?? []).filter((w) => poolSet.has(w))
  const state: Cascade = { r: stored?.r ?? 0, levels, round }
  return round.length === 0 && pool.length > 0 ? advance(state, pool) : state
}

// ---- 持久化（IndexedDB，按 filterKey 单条记录）----

function isCascade(v: unknown): v is Cascade {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.r === 'number' &&
    Array.isArray(o.levels) &&
    o.levels.every(isStringArray) &&
    isStringArray(o.round)
  )
}

let cache = new Map<string, Cascade>()

/** 某本词书的级联状态（没有则 null） */
export function loadCascade(key: string): Cascade | null {
  return cache.get(key) ?? null
}

export function saveCascade(key: string, c: Cascade): void {
  cache.set(key, c)
  put('cascade', key, c)
}

/** 删除某本词书的级联状态（删书时用） */
export function removeCascade(key: string): void {
  if (!cache.has(key)) return
  cache.delete(key)
  del('cascade', key)
}

export async function hydrateCascade(): Promise<void> {
  const raw = await loadStore('cascade')
  cache = new Map()
  for (const [k, v] of Object.entries(raw)) {
    if (isCascade(v)) cache.set(k, v)
  }
}
