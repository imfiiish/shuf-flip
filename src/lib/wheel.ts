// 滚轮翻卡：向下/向右 → 下一张，向上/向左 → 上一张。
// 累积位移超过阈值、且距上次翻卡超过冷却时间才翻一张；停手一小会儿清除累积。
import { useEffect, useRef } from 'react'

const THRESHOLD = 24 // 触发一次翻卡所需的累积位移（px）
const COOLDOWN = 120 // 两次翻卡之间的最短间隔（ms）
const IDLE = 150 // 停止滚动多久后清空累积（ms）

export function useWheelFlip(flip: (delta: 1 | -1) => void): void {
  const flipRef = useRef(flip)
  flipRef.current = flip

  useEffect(() => {
    let acc = 0
    let last = 0
    let idle: ReturnType<typeof setTimeout> | undefined

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return // 触控板捏合缩放，交给浏览器
      e.preventDefault() // 学习页本身不滚动，避免触发页面/历史手势
      // 统一成像素：Firefox 鼠标滚轮常用 DOM_DELTA_LINE
      const unit =
        e.deltaMode === 1
          ? 16
          : e.deltaMode === 2
            ? window.innerHeight
            : 1
      // 以竖直为主，横滚（触控板左右滑）也支持
      const raw = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      acc += raw * unit

      // 停手后清空累积，避免「停一下再补一点」就触发一张
      clearTimeout(idle)
      idle = setTimeout(() => {
        acc = 0
      }, IDLE)

      if (Math.abs(acc) < THRESHOLD) return
      const now = performance.now()
      if (now - last < COOLDOWN) return
      const dir: 1 | -1 = acc > 0 ? 1 : -1
      acc = 0
      last = now
      flipRef.current(dir)
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      clearTimeout(idle)
      window.removeEventListener('wheel', onWheel)
    }
  }, [])
}
