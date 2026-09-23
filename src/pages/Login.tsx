import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../lib/auth'

// 登录页品牌名：中英交替显示
const BRANDS = ['Shuf & Flip', '洗牌 · 翻牌'] as const

export default function Login() {
  const navigate = useNavigate()
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => {
      setIdx((v) => (v + 1) % BRANDS.length)
    }, 2600)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="page">
      <div className="panel">
        <h1 className="brand">
          {BRANDS.map((name, i) => (
            <span key={name} className={i === idx ? 'on' : ''} aria-hidden={i !== idx}>
              {name}
            </span>
          ))}
        </h1>
        <button
          className="btn btn-primary"
          onClick={() => {
            login()
            navigate('/', { replace: true })
          }}
        >
          登录
        </button>
      </div>
    </div>
  )
}
