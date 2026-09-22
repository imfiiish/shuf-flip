// Study / Quiz 共用的卡片会话逻辑
import { useEffect, useRef } from 'react'
import { preloadAudio } from './audio'
import { getWord } from './dict'
import { flushBeacon } from './analytics'

/** 预加载一组词的发音（缺音频的自动跳过） */
export function usePreloadWords(names: readonly string[]): void {
  useEffect(() => {
    preloadAudio(
      names.flatMap((n) => {
        const w = getWord(n)
        return w?.audio ? [w.audio] : []
      }),
    )
  }, [names])
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
