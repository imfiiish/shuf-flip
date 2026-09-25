// 级联窗口抽样（服务端）。详见 docs/sampling.md。参数：R=16、W=64、g=4、n=8、m=3。

/** 每轮抽取的词数 */
export const ROUND_SIZE = 16
/** 活跃窗口（最小池）大小 */
const WINDOW = 64
/** 活跃窗口寿命（轮） */
export const WINDOW_ROUNDS = 8
/** 每级窗口的词数倍率 */
const GROW = 4
/** 每级周期倍率 */
const MULT = 3

export type Cascade = {
  /** 下一轮要画的序号（0 起） */
  roundSeq: number
  /** levels[0] = 活跃窗口；…；levels[last] = 整个词池 */
  levels: string[][]
  /** 当前显示的这一轮的词 */
  words: string[]
}

/** 洗牌取前 k 个（均匀随机、不重复） */
function pick(pool: readonly string[], k: number): string[] {
  const a = [...pool]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a.slice(0, Math.max(0, Math.min(k, a.length)))
}

/** 级联链：从 WINDOW 起每级 ×GROW，最后接 N */
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

/** 用当前池校准已存级联；链长度变了（池子大变）→ 重建 */
function fitLevels(
  stored: string[][] | null,
  pool: readonly string[],
): string[][] {
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
  const roundSeq = c.roundSeq
  if (roundSeq > 0) {
    for (let i = levels.length - 2; i >= 0; i--) {
      if (roundSeq % periodOf(i) === 0) {
        levels[i] = pick(levels[i + 1] ?? pool, chain[i])
      }
    }
  }
  const win = levels[0] ?? [...pool]
  return {
    roundSeq: roundSeq + 1,
    levels,
    words: pick(win, ROUND_SIZE),
  }
}

/**
 * 校准已存级联；没有可用的当前轮时画一轮。
 * generated 表示「这次是否新画了一轮」。
 */
export function ensureCascade(
  stored: Cascade | null,
  pool: readonly string[],
): { cascade: Cascade; generated: boolean } {
  const levels = fitLevels(stored?.levels ?? null, pool)
  const poolSet = new Set(pool)
  const words = (stored?.words ?? []).filter((w) => poolSet.has(w))
  const state: Cascade = { roundSeq: stored?.roundSeq ?? 0, levels, words }
  if (words.length === 0 && pool.length > 0) {
    return { cascade: advance(state, pool), generated: true }
  }
  return { cascade: state, generated: false }
}
