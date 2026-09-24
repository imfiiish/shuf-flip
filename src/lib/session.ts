// Study / Quiz 共用的卡片会话逻辑
import { useEffect, useRef, useState } from 'react'
import { preloadAudio } from './audio'
import { flushBeacon } from './analytics'
import { detailsReady, findWord, loadDetails } from '../data/words'

/** 详情（音标/释义/音频）是否就绪；未就绪时触发加载并等其完成 */
export function useWordDetails(): boolean {
  const [ready, setReady] = useState(detailsReady)
  useEffect(() => {
    void loadDetails().then(
      () => setReady(true),
      () => setReady(true), // 失败也放行，只是没有释义/音频
    )
  }, [])
  return ready
}

/** 预加载一组词的发音（缺音频的自动跳过）；ready=false 时不加载 */
export function usePreloadWords(names: readonly string[], ready = true): void {
  useEffect(() => {
    if (!ready) return
    preloadAudio(
      names.flatMap((n) => {
        const w = findWord(n)
        return w?.audio ? [w.audio] : []
      }),
    )
  }, [names, ready])
}

/**
 * 会话收尾：关页时调 onPageHide 并立即 flush，真正卸载时调 onUnmount。
 * 用「微任务 + aliveRef」区分 StrictMode 的假卸载（它会在立刻重挂前跑一次清理）。
 */
export function useExitLifecycle(opts: {
  onPageHide?: () => void
  onUnmount?: () => void
}): void {
  const optsRef = useRef(opts)
  optsRef.current = opts
  const aliveRef = useRef(true)

  useEffect(() => {
    const onPageHide = () => {
      optsRef.current.onPageHide?.()
      flushBeacon()
    }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [])

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      queueMicrotask(() => {
        if (!aliveRef.current) optsRef.current.onUnmount?.()
      })
    }
  }, [])
}
