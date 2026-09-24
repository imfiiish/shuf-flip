// 启动时把持久层读进各模块的内存缓存；卸载前 flush 未落盘的写。
import { initKV, flush } from './kv'
import { hydrateCascade } from './cascade'
import { hydrateProgress } from './progress'
import { hydrateQuiz } from './quiz'
import { hydrateStats, statsSnapshot } from './stats'
import { hydratePending } from './pending'

export async function hydrate(): Promise<void> {
  // 持久层是「加分项」：任何异常都不应阻止应用渲染
  try {
    await initKV()
  } catch (e) {
    console.warn('[kv] init failed', e)
  }
  try {
    await Promise.all([
      hydrateCascade(),
      hydrateProgress(),
      hydrateQuiz(),
      hydrateStats(),
      hydratePending(),
    ])
  } catch (e) {
    console.warn('[kv] hydrate failed', e)
  }

  // 调试出口：dev 下控制台 `__stats()` 看词级统计快照
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    ;(window as unknown as { __stats?: unknown }).__stats = statsSnapshot
  }

  if (typeof window !== 'undefined') {
    const flushAll = () => void flush()
    window.addEventListener('pagehide', flushAll)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushAll()
    })
  }
}
