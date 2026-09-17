import { useNavigate } from 'react-router-dom'
import { logout } from '../auth'
import ThemeToggle from '../components/ThemeToggle'

export default function Home() {
  const navigate = useNavigate()

  return (
    <div className="page home-page">
      <button className="btn btn-primary" onClick={() => navigate('/study')}>
        学习
      </button>

      <ThemeToggle />

      <button
        type="button"
        className="icon-btn logout-btn"
        onClick={() => {
          logout()
          navigate('/login', { replace: true })
        }}
        aria-label="退出登录"
        title="退出登录"
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
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
    </div>
  )
}
