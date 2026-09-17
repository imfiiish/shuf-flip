import { useNavigate } from 'react-router-dom'

type Props = {
  to: string
  label: string
}

/** 左上角圆形返回按钮（固定视口），to 指定返回目标 */
export default function BackButton({ to, label }: Props) {
  const navigate = useNavigate()

  return (
    <button
      type="button"
      className="icon-btn back-btn"
      onClick={() => navigate(to)}
      aria-label={label}
      title={label}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
    </button>
  )
}
