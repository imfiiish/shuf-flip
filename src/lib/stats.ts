// 词级学习统计（全局按词、跨词书）。单位是「回合」，全部按回合去重：
// 同一个词在一轮里 center 多少次、翻开多少次，都只算 1。
//
//   met              被 center 过的回合数（替代旧的布尔 coverage）
//   checked          翻开过释义的回合数（「查了答案」的回合数）
//   lastAt           最后一次成为中心卡的时间戳 ms（复习调度按真实时间）
//   lastRound        上次计入 met 的回合序（去重锁）
//   lastCheckedRound 上次计入 checked 的回合序
//   rating           最近一次 quiz 评分（0=还没评过），复习调度的「真值」
//   ratingAt         最近一次 quiz 评分的时间戳 ms
import { loadStore, put, del, getKV } from './kv'

/** quiz 三档：1 陌生 / 2 模糊 / 3 熟悉 */
export type Rating = 1 | 2 | 3

export type WordStat = {
  met: number
  checked: number
  lastAt: number
  lastRound: number
  lastCheckedRound: number
  rating: 0 | Rating
  ratingAt: number
}

/** 全局回合序 + 当前回合签名（幂等锁）存在 misc 里 */
const SEQ_KEY = 'statsRound'

function zero(): WordStat {
  return {
    met: 0,
    checked: 0,
    lastAt: 0,
    lastRound: -1,
    lastCheckedRound: -1,
    rating: 0,
    ratingAt: 0,
  }
}

function isRating(v: unknown): v is Rating {
  return v === 1 || v === 2 || v === 3
}

/** 宽松解析：缺 rating/ratingAt 的旧记录补 0，不丢 met/checked */
function parseStat(v: unknown): WordStat | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (
    typeof o.met !== 'number' ||
    typeof o.checked !== 'number' ||
    typeof o.lastAt !== 'number' ||
    typeof o.lastRound !== 'number' ||
    typeof o.lastCheckedRound !== 'number'
  ) {
    return null
  }
  return {
    met: o.met,
    checked: o.checked,
    lastAt: o.lastAt,
    lastRound: o.lastRound,
    lastCheckedRound: o.lastCheckedRound,
    rating: isRating(o.rating) ? o.rating : 0,
    ratingAt: typeof o.ratingAt === 'number' ? o.ratingAt : 0,
  }
}

let cache = new Map<string, WordStat>()
let seq = 0
let seqSig = ''

function statOf(word: string): WordStat {
  let s = cache.get(word)
  if (!s) {
    s = zero()
    cache.set(word, s)
  }
  return s
}

function saveStat(word: string, s: WordStat): void {
  cache.set(word, s)
  put('stats', word, s)
}

/**
 * 进入新一轮：推进全局回合序。同一 sig 重复进入（StrictMode / 刷新 / 重进）
 * 视为同一轮，不重复推进。sig 传 `${filterKey}#${cascade.r}`，一轮内稳定。
 */
export function enterRound(sig: string): number {
  if (sig !== seqSig) {
    seq += 1
    seqSig = sig
    put('misc', SEQ_KEY, { seq, sig })
  }
  return seq
}

/** 成为中心卡：本回合首次才 met+1；lastAt 每次都刷新 */
export function markCentered(word: string): void {
  const s = statOf(word)
  s.lastAt = Date.now()
  if (s.lastRound !== seq) {
    s.lastRound = seq
    s.met += 1
  }
  saveStat(word, s)
}

/** 评分前需要保留的部分，供撤销还原 */
export type RatingSnapshot = {
  rating: 0 | Rating
  ratingAt: number
  lastAt: number
}

/** 记一次 quiz 评分（最近一次覆盖旧的，复习调度的真值）。
 *  顺带把 lastAt 归零——quiz 也是一次「复习」，间隔从这次算起。
 *  返回改动前的快照，供撤销还原。 */
export function markRated(word: string, rating: Rating): RatingSnapshot {
  const s = statOf(word)
  const prev: RatingSnapshot = {
    rating: s.rating,
    ratingAt: s.ratingAt,
    lastAt: s.lastAt,
  }
  const now = Date.now()
  s.rating = rating
  s.ratingAt = now
  s.lastAt = now
  saveStat(word, s)
  return prev
}

/** 撤销评分：还原 markRated 前的快照 */
export function restoreRating(word: string, snap: RatingSnapshot): void {
  const s = statOf(word)
  s.rating = snap.rating
  s.ratingAt = snap.ratingAt
  s.lastAt = snap.lastAt
  saveStat(word, s)
}

/** 翻开释义：本回合首次才 checked+1 */
export function markChecked(word: string): void {
  const s = statOf(word)
  if (s.lastCheckedRound !== seq) {
    s.lastCheckedRound = seq
    s.checked += 1
    saveStat(word, s)
  }
}

/** 单条统计（无则 undefined） */
export function getStat(word: string): WordStat | undefined {
  return cache.get(word)
}

/** 某个词表里「碰到过」（met>0）的词数 */
export function statsCoverage(words: readonly string[]): number {
  let n = 0
  for (const w of words) if ((cache.get(w)?.met ?? 0) > 0) n += 1
  return n
}

/** 当前全局回合序（调试用） */
export function roundSeq(): number {
  return seq
}

/** 全量快照（调试用 `__stats()`，同步也用） */
export function statsSnapshot(): Record<string, WordStat> {
  return Object.fromEntries(cache)
}

/** 用远端数据整体替换本地（同步用） */
export function statsRestore(obj: unknown): void {
  const next = new Map<string, WordStat>()
  if (obj && typeof obj === 'object') {
    for (const [w, v] of Object.entries(obj)) {
      const s = parseStat(v)
      if (s) next.set(w, s)
    }
  }
  for (const w of cache.keys()) if (!next.has(w)) del('stats', w)
  cache = next
  for (const [w, s] of next) put('stats', w, s)
}

/** 全局回合序快照/还原（同步用；不含会让 lastRound 对不上） */
export function statsSeqSnapshot(): { seq: number; sig: string } {
  return { seq, sig: seqSig }
}
export function statsSeqRestore(o: unknown): void {
  const r = (o ?? {}) as { seq?: unknown; sig?: unknown }
  seq = typeof r.seq === 'number' ? r.seq : 0
  seqSig = typeof r.sig === 'string' ? r.sig : ''
  put('misc', SEQ_KEY, { seq, sig: seqSig })
}

export async function hydrateStats(): Promise<void> {
  const raw = await loadStore('stats')
  cache = new Map()
  for (const [w, v] of Object.entries(raw)) {
    const s = parseStat(v)
    if (s) cache.set(w, s)
  }

  const rec = await getKV<{ seq?: number; sig?: string }>('misc', SEQ_KEY)
  seq = typeof rec?.seq === 'number' ? rec.seq : 0
  seqSig = typeof rec?.sig === 'string' ? rec.sig : ''

  // 迁移旧 coverage（布尔 seen）→ stats.met=1
  const cov = await loadStore('coverage')
  for (const w of Object.keys(cov)) {
    if (cache.has(w)) continue
    const s = zero()
    s.met = 1
    cache.set(w, s)
    put('stats', w, s)
  }
}
