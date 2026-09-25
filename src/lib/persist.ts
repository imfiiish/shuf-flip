// 启动时把持久层读进各模块的内存缓存；卸载前 flush 未落盘的写。
import { initKV, flush } from './kv'
import { hydrateProgress } from './progress'
import { hydrateQuiz } from './quiz'
import { hydratePending } from './pending'

export async function hydrate(): Promise<void> {
  // 持久层是「加分项」：任何异常都不应阻止应用渲染
  try {
    await initKV()
  } catch (e) {
    console.warn('[kv] init failed', e)
  }
  try {
    await Promise.all([hydrateProgress(), hydrateQuiz(), hydratePending()])
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
