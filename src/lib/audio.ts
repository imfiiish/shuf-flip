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

/** 淡出时长（秒）。极快连点/换词时用它抹掉硬切的截断声 */
const FADE = 0.006
/** 淡入时长（秒）：比淡出更短，够消「咔」即可，尽量不削词首 */
const FADE_IN = 0.003
/** 起播前瞻（秒）：把 start 排到未来一点，避免主线程/音频线程错位把开头切掉 */
const START_LOOKAHEAD = 0.02

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

let primed = false
/**
 * 首次用户手势时预热音频输出：resume 上下文 + 播一帧静音。
 * AudioContext 在页面加载时是 suspended，必须在手势里 resume；
 * 否则第一次真正出声时输出管线尚未就绪，开头常被吃掉。
 */
export function primeAudio(): void {
  if (primed) return
  primed = true
  const context = getCtx()
  void context.resume()
  try {
    const src = context.createBufferSource()
    src.buffer = context.createBuffer(1, 1, context.sampleRate)
    src.connect(context.destination)
    src.onended = () => {
      try {
        src.disconnect()
      } catch {
        /* noop */
      }
    }
    src.start()
  } catch {
    /* 预热失败不影响正常播放 */
  }
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
      // 首帧没有更早的手势时，这里也补一次预热
      primeAudio()

      void (async () => {
        // 先确保上下文在跑：resume 未 await 就 start，会被半挂起状态吃掉开头
        if (context.state !== 'running') {
          try {
            await context.resume()
          } catch {
            /* 下面仍尝试调度 */
          }
        }
        let buf: AudioBuffer
        try {
          buf = await loadBuffer(audioUrl(file))
        } catch {
          return
        }
        if (token !== tokenRef.current) return // 期间又点了别的，丢弃

        const source = context.createBufferSource()
        source.buffer = buf

        // 每条自带 gain：淡入，避免起始「咔」
        const gain = context.createGain()
        // 留起播前瞻，保证 start 始终落在未来，不被音频线程错位截头
        const startAt = context.currentTime + START_LOOKAHEAD
        gain.gain.setValueAtTime(0, startAt)
        gain.gain.linearRampToValueAtTime(1, startAt + FADE_IN)
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
        source.start(startAt)
      })()
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
