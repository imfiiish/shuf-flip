// 通用弹窗骨架：遮罩点击关闭 + 关闭按钮 + Esc 关闭
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { CloseIcon } from './icons'

type Props = {
  onClose: () => void
  ariaLabel: string
  /** 附加到 .modal 上的类名（如 book-modal） */
  className?: string
  /** 是否响应 Esc（改名等编辑态下可临时关掉） */
  closeOnEscape?: boolean
  children: ReactNode
}

export default function Modal({
  onClose,
  ariaLabel,
  className = '',
  closeOnEscape = true,
  children,
}: Props) {
  useEffect(() => {
    if (!closeOnEscape) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeOnEscape, onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="icon-btn modal-close"
          onClick={onClose}
          aria-label="关闭"
          title="关闭"
        >
          <CloseIcon />
        </button>
        {children}
      </div>
    </div>
  )
}
