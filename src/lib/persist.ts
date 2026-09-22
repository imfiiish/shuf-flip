// 启动时把持久层读进各模块的内存缓存；卸载前 flush 未落盘的写。
import { initKV, flush, put } from './kv'
import { hydrateCascade } from './cascade'
import { hydrateCoverage } from './coverage'
import { hydrateProgress } from './progress'
import { hydrateQuiz } from './quiz'

const MIGRATED_KEY = 'vocab-idb-migrated'

function readLS<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

/**
 * 把旧的 localStorage 状态一次性搬进持久层。
 * 词维度的覆盖 / 翻卡次数仍有效，保留；书维度的 cascade/centers、quiz 一并搬，
 * 读取时各自校验，旧的无效数据自然被丢弃。
 */
async function importLegacy(): Promise<void> {
  // 远古遗留 key：无条件清（幂等）
  for (const k of ['vocab-session', 'vocab-round-orders']) {
    try {
      localStorage.removeItem(k)
    } catch {
      /* 忽略 */
    }
  }

  let done = false
  try {
    done = localStorage.getItem(MIGRATED_KEY) === '1'
  } catch {
    return // localStorage 不可用：跳过迁移
  }
  if (done) return

  const coverage = readLS<{ seen?: string[] }>('vocab-coverage')
  if (coverage) {
    for (const w of coverage.seen ?? []) put('coverage', w, 1)
  }

  const reveal = readLS<{ day?: string; counts?: Record<string, number> }>(
    'vocab-reveal-counts',
  )
  if (reveal?.day && reveal.counts) {
    put('revealDay', reveal.day, reveal.counts)
  }

  const cascade = readLS<Record<string, unknown>>('vocab-cascade')
  if (cascade) for (const [k, v] of Object.entries(cascade)) put('cascade', k, v)

  const centers = readLS<Record<string, unknown>>('vocab-centers')
  if (centers) for (const [k, v] of Object.entries(centers)) put('centers', k, v)

  const quiz = readLS<unknown>('vocab-quiz')
  if (quiz != null) put('misc', 'quiz', quiz)

  await flush()

  for (const k of [
    'vocab-coverage',
    'vocab-reveal-counts',
    'vocab-cascade',
    'vocab-centers',
    'vocab-quiz',
  ]) {
    try {
      localStorage.removeItem(k)
    } catch {
      /* 忽略 */
    }
  }
  try {
    localStorage.setItem(MIGRATED_KEY, '1')
  } catch {
    /* 忽略 */
  }
}

export async function hydrate(): Promise<void> {
  // 持久层是「加分项」：任何异常都不应阻止应用渲染
  try {
    await initKV()
  } catch (e) {
    console.warn('[kv] init failed', e)
  }
  try {
    await importLegacy()
  } catch (e) {
    console.warn('[kv] migrate failed', e)
  }
  try {
    await Promise.all([
      hydrateCascade(),
      hydrateCoverage(),
      hydrateProgress(),
      hydrateQuiz(),
    ])
  } catch (e) {
    console.warn('[kv] hydrate failed', e)
  }

  if (typeof window !== 'undefined') {
    const flushAll = () => void flush()
    window.addEventListener('pagehide', flushAll)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushAll()
    })
  }
}
