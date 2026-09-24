// 双击右键（触控板双指点两次）：
// 浏览器拿不到「手指数」，但「双指点按」在 Linux / Windows / macOS 默认都产生
// 右键（contextmenu），所以「两次双指点按」= 两次 contextmenu。
// 本 hook 只负责识别「窗口内两次右键」，并顺手屏蔽原生右键菜单——
// 否则第一次弹出的菜单会打断第二次点击。
import { useEffect, useRef } from 'react'

/** 双击判定窗口（ms）：两次右键间隔不超过它算双击 */
const DOUBLE_RIGHT_CLICK_MS = 400

type DoubleRightClickOptions = {
  /** 双击判定窗口（ms），默认 400 */
  windowMs?: number
  /** 返回 true 表示这次右键不参与双击判定（如落在中心卡上，那里单击=复制） */
  ignore?: (target: Element | null) => boolean
}

export function useDoubleRightClick(
  onDoubleClick: () => void,
  { windowMs = DOUBLE_RIGHT_CLICK_MS, ignore }: DoubleRightClickOptions = {},
): void {
  const cbRef = useRef(onDoubleClick)
  const ignoreRef = useRef(ignore)
  cbRef.current = onDoubleClick
  ignoreRef.current = ignore

  useEffect(() => {
    // 上一次右键的时刻；0 表示没有待配对的第一次
    let last = 0

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault() // 本应用用右键做手势，屏蔽原生菜单
      const target = e.target instanceof Element ? e.target : null
      if (ignoreRef.current?.(target)) {
        last = 0 // 落在忽略区（中心卡）：不算手势，也断开已有配对
        return
      }
      const now = performance.now()
      if (last !== 0 && now - last <= windowMs) {
        last = 0 // 配对成功，重置
        cbRef.current()
      } else {
        last = now // 记下第一次，等第二次
      }
    }

    window.addEventListener('contextmenu', onContextMenu)
    return () => window.removeEventListener('contextmenu', onContextMenu)
  }, [windowMs])
}
