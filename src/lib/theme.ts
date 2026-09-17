// 主题模式：自动（跟随系统）/ 亮 / 暗，持久化到 localStorage
import { readString, writeString } from './storage'

export type ThemeMode = 'auto' | 'light' | 'dark'

// 需与 index.html 里首屏内联脚本的 key 保持一致
const KEY = 'vocab-theme'

export function getThemeMode(): ThemeMode {
  const v = readString(KEY)
  return v === 'light' || v === 'dark' ? v : 'auto'
}

export function saveThemeMode(mode: ThemeMode): void {
  writeString(KEY, mode)
}

/** 把模式解析成实际生效的 light / dark */
export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'auto') return mode
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

/** 写到 <html data-theme>，CSS 据此切换变量 */
export function applyTheme(mode: ThemeMode): void {
  document.documentElement.dataset.theme = resolveTheme(mode)
}
