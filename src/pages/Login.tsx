import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../lib/auth'

// 登录页品牌名：中英交替显示
const BRANDS = ['Shuf & Flip', '洗牌 · 翻牌'] as const

// 与后端一致：3–20 位，字母开头，仅小写字母/数字
const USERNAME_RE = /^[a-z][a-z0-9]{2,19}$/

export default function Login() {
  const navigate = useNavigate()
  const [idx, setIdx] = useState(0)
  // false=只有标题+「进入」；true=中间撑开 username，按钮变「登录」
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState('')
  // 校验提示：停笔一下才显示，避免每敲一个字就弹
  const [showHint, setShowHint] = useState(false)
  // 刚变合法时给按钮一个「就绪」小反馈
  const [readyPulse, setReadyPulse] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const wasValid = useRef(false)

  const valid = USERNAME_RE.test(username)

  useEffect(() => {
    const id = window.setInterval(() => {
      setIdx((v) => (v + 1) % BRANDS.length)
    }, 2600)
    return () => window.clearInterval(id)
  }, [])

  // 展开后自动聚焦输入框
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // 不合法提示：停笔 450ms 再显示；一旦合法/清空立即收起
  useEffect(() => {
    if (!open || username === '' || valid) {
      setShowHint(false)
      return
    }
    const id = window.setTimeout(() => setShowHint(true), 450)
    return () => window.clearTimeout(id)
  }, [open, username, valid])

  // disabled → enabled 的瞬间，给按钮一个就绪小弹
  useEffect(() => {
    const became = open && valid && !wasValid.current
    wasValid.current = valid
    if (!became) return
    setReadyPulse(true)
    const id = window.setTimeout(() => setReadyPulse(false), 300)
    return () => window.clearTimeout(id)
  }, [open, valid])

  const enter = () => {
    if (!valid) return
    login(username)
    navigate('/', { replace: true })
  }

  return (
    <div className="page">
      <div className="panel login-panel">
        <h1 className="brand">
          {BRANDS.map((name, i) => (
            <span key={name} className={i === idx ? 'on' : ''} aria-hidden={i !== idx}>
              {name}
            </span>
          ))}
        </h1>

        {/* 点「进入」后从标题与按钮之间撑开 */}
        <div className={`login-field${open ? ' open' : ''}`} aria-hidden={!open}>
          <input
            ref={inputRef}
            className="login-input"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="username"
            value={username}
            disabled={!open}
            tabIndex={open ? 0 : -1}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') enter()
            }}
          />
          <p
            className={`login-hint${showHint ? ' show' : ''}`}
            aria-hidden={!showHint}
          >
            3–20 位，字母开头，仅小写字母与数字
          </p>
        </div>

        <button
          className={`btn btn-primary${readyPulse ? ' ready' : ''}`}
          disabled={open && !valid}
          onClick={() => {
            if (!open) {
              setOpen(true)
              return
            }
            enter()
          }}
        >
          {open ? '登录' : '进入'}
        </button>
      </div>
    </div>
  )
}
