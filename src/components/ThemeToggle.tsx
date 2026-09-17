import { useEffect, useState } from 'react'
import type { ThemeMode } from '../lib/theme'
import { applyTheme, getThemeMode, saveThemeMode } from '../lib/theme'

// 循环顺序：自动 → 亮 → 暗 → 自动
const ORDER: ThemeMode[] = ['auto', 'light', 'dark']

const LABEL: Record<ThemeMode, string> = {
  auto: '自动',
  light: '亮色',
  dark: '暗色',
}

function Icon({ mode }: { mode: ThemeMode }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  if (mode === 'light') {
    // 太阳
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <line x1="12" y1="2" x2="12" y2="4" />
        <line x1="12" y1="20" x2="12" y2="22" />
        <line x1="2" y1="12" x2="4" y2="12" />
        <line x1="20" y1="12" x2="22" y2="12" />
        <line x1="4.9" y1="4.9" x2="6.3" y2="6.3" />
        <line x1="17.7" y1="17.7" x2="19.1" y2="19.1" />
        <line x1="4.9" y1="19.1" x2="6.3" y2="17.7" />
        <line x1="17.7" y1="6.3" x2="19.1" y2="4.9" />
      </svg>
    )
  }

  if (mode === 'dark') {
    // 月亮
    return (
      <svg {...common}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    )
  }

  // 自动：半明半暗
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(getThemeMode)

  useEffect(() => {
    saveThemeMode(mode)
    applyTheme(mode)
    // 自动模式：跟随系统变化实时更新
    if (mode !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('auto')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  return (
    <button
      type="button"
      className="icon-btn theme-toggle"
      onClick={() =>
        setMode((m) => ORDER[(ORDER.indexOf(m) + 1) % ORDER.length])
      }
      aria-label={`主题：${LABEL[mode]}，点击切换`}
      title={`主题：${LABEL[mode]}（点击切换）`}
    >
      <Icon mode={mode} />
    </button>
  )
}
