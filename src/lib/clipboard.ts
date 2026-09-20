// 复制文本到剪贴板：优先 Clipboard API，不可用/被拒时退回 execCommand。
// 返回是否复制成功。

function fallbackCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

export function copyText(text: string): Promise<boolean> {
  const p = navigator.clipboard?.writeText(text)
  if (p) return p.then(() => true).catch(() => fallbackCopy(text))
  return Promise.resolve(fallbackCopy(text))
}
