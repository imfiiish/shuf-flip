// 音频播放：词库音频都在 public/audio 下，用同一个文件名规则。
//
// 用 Web Audio 解码后播放，而不是 <audio> 元素：
//  - 快速连点 / 换词时即停即播，不会出现媒体元素抢通道的顿挫
//  - 单声道解码后直连输出，稳定居中，不会出现「只响一边 / 左右跳」
import { useCallback, useEffect, useRef } from 'react'

const BASE = import.meta.env.BASE_URL
const audioUrl = (file: string) => `${BASE}audio/${file}`

/** 解码结果缓存上限，避免下游词量大时吃内存（每个约 0.1~0.2MB） */
const CACHE_LIMIT = 300

/** 淡入淡出时长（秒）。极快连点/换词时用它抹掉硬切的截断声 */
const FADE = 0.006

let ctx: AudioContext | null = null
let master: GainNode | null = null

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

function getMaster(): GainNode {
  const context = getCtx()
  if (!master) {
    master = context.createGain()
    master.connect(context.destination)
  }
  return master
}

// url -> 解码后的 AudioBuffer（简易 LRU：Map 保持插入序，超限淘汰最旧）
const buffers = new Map<string, AudioBuffer>()
// url -> 正在解码的 Promise，避免同一文件并发解码
const pending = new Map<string, Promise<AudioBuffer>>()

function cacheBuffer(url: string, buf: AudioBuffer) {
  buffers.set(url, buf)
  while (buffers.size > CACHE_LIMIT) {
    const oldest = buffers.keys().next().value
    if (oldest === undefined) break
    buffers.delete(oldest)
  }
}

function loadBuffer(url: string): Promise<AudioBuffer> {
  const cached = buffers.get(url)
  if (cached) return Promise.resolve(cached)
  const inflight = pending.get(url)
  if (inflight) return inflight

  const p = fetch(url, { cache: 'force-cache' })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.arrayBuffer()
    })
    .then((data) => getCtx().decodeAudioData(data))
    .then((buf) => {
      cacheBuffer(url, buf)
      pending.delete(url)
      return buf
    })
    .catch((err) => {
      pending.delete(url)
      throw err
    })

  pending.set(url, p)
  return p
}

/** 当前发声的一条：source + 它专属的淡入淡出 gain */
type Voice = { source: AudioBufferSourceNode; gain: GainNode }

/**
 * 播放单条音频。同一时刻只播一个：重播 / 换词前先把上一个淡出。
 * 组件卸载时停止。
 */
export function useAudioPlayer(): (file?: string) => void {
  const voiceRef = useRef<Voice | null>(null)
  const tokenRef = useRef(0)

  // 淡出旧声：先沿当前音量降到 0（避免硬切 pop），到点再 stop + 释放
  const stop = useCallback(() => {
    const v = voiceRef.current
    if (!v) return
    voiceRef.current = null

    const { source, gain } = v
    source.onended = null
    const cleanup = () => {
      try {
        source.disconnect()
      } catch {
        /* noop */
      }
      try {
        gain.disconnect()
      } catch {
        /* noop */
      }
    }

    const now = getCtx().currentTime
    try {
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(gain.gain.value, now)
      gain.gain.linearRampToValueAtTime(0, now + FADE)
      source.stop(now + FADE)
      source.onended = cleanup
    } catch {
      cleanup()
    }
  }, [])

  const play = useCallback(
    (file?: string) => {
      const token = ++tokenRef.current
      stop()
      if (!file) return

      const context = getCtx()
      // 自动播放策略：需在用户手势里恢复上下文（首次点击后才出声）
      if (context.state === 'suspended') void context.resume()

      loadBuffer(audioUrl(file))
        .then((buf) => {
          if (token !== tokenRef.current) return // 期间又点了别的，丢弃
          const source = context.createBufferSource()
          source.buffer = buf

          // 每条自带 gain：淡入，避免起始「咔」
          const gain = context.createGain()
          const now = context.currentTime
          gain.gain.setValueAtTime(0, now)
          gain.gain.linearRampToValueAtTime(1, now + FADE)
          source.connect(gain)
          gain.connect(getMaster())

          const voice: Voice = { source, gain }
          voiceRef.current = voice
          source.onended = () => {
            if (voiceRef.current === voice) voiceRef.current = null
            try {
              source.disconnect()
            } catch {
              /* noop */
            }
            try {
              gain.disconnect()
            } catch {
              /* noop */
            }
          }
          source.start(now)
        })
        .catch(() => {})
    },
    [stop],
  )

  useEffect(
    () => () => {
      tokenRef.current++ // 让在途的解码结果失效
      stop()
    },
    [stop],
  )

  return play
}

/** 预加载一组音频：提前 fetch + 解码，首次播放即时出声 */
export function preloadAudio(files: string[]): void {
  getCtx() // 提前建好上下文，把解码挪出用户点击
  files.forEach((file) => {
    loadBuffer(audioUrl(file)).catch(() => {})
  })
}
