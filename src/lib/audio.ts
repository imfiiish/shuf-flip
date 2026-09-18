// 音频播放：词库音频都在 public/audio 下，用同一个文件名规则
import { useCallback, useEffect, useRef } from 'react'

const BASE = import.meta.env.BASE_URL
const audioUrl = (file: string) => `${BASE}audio/${file}`

/**
 * 播放单条音频。同一时刻只播一个：
 * 重播/换词前先停掉上一个，避免快速连按时抢跑或叠加。
 * 组件卸载时自动停止。
 */
export function useAudioPlayer(): (file?: string) => void {
  const ref = useRef<HTMLAudioElement | null>(null)

  const stop = useCallback(() => {
    ref.current?.pause()
    ref.current = null
  }, [])

  const play = useCallback(
    (file?: string) => {
      stop()
      if (!file) return
      const audio = new Audio(audioUrl(file))
      audio.preload = 'auto'
      audio.addEventListener('ended', () => {
        if (ref.current === audio) ref.current = null
      })
      ref.current = audio
      audio.play().catch(() => {})
    },
    [stop],
  )

  useEffect(() => stop, [stop])

  return play
}

/** 预加载一组音频，首次播放不延迟 */
export function preloadAudio(files: string[]): void {
  files.forEach((file) => {
    const audio = new Audio(audioUrl(file))
    audio.preload = 'auto'
  })
}
