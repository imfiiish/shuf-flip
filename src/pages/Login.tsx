import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../lib/auth'

// 登录页品牌名：中英交替显示
const BRANDS = ['Shuf & Flip', '洗牌 · 翻牌'] as const

// 与后端一致：3–20 位，字母开头，仅小写字母/数字
const USERNAME_RE = /^[a-z][a-z0-9]{2,19}$/
const PIN_LEN = 4

export default function Login() {
  const navigate = useNavigate()
  const [idx, setIdx] = useState(0)
  // 0=只有标题+「进入」；1=输入 username（按钮「确认」）；2=输入 pin（按钮「登录」）
  const [stage, setStage] = useState<0 | 1 | 2>(0)
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  // username 校验提示：停笔一下才显示
  const [showHint, setShowHint] = useState(false)
  // 输了非数字时的提示
  const [pinHint, setPinHint] = useState(false)
  // 刚变可点（disabled → enabled）时给按钮一个「就绪」小反馈
  const [readyPulse, setReadyPulse] = useState(false)
  const usernameRef = useRef<HTMLInputElement>(null)
  const pinRef = useRef<HTMLInputElement>(null)
  const wasReady = useRef(true)
  const pinHintTimer = useRef<number | undefined>(undefined)

  const valid = USERNAME_RE.test(username)
  // 按钮是否可点：未展开时可（进入）；username 步要合法；pin 步要满 4 位
  const canPress = stage === 0 || (stage === 1 ? valid : pin.length === PIN_LEN)

  useEffect(() => {
    const id = window.setInterval(() => {
      setIdx((v) => (v + 1) % BRANDS.length)
    }, 2600)
    return () => window.clearInterval(id)
  }, [])

  // 每步自动聚焦
  useEffect(() => {
    if (stage === 1) usernameRef.current?.focus()
    else if (stage === 2) pinRef.current?.focus()
  }, [stage])

  // username 变得不合法 → 退回 username 步并清掉 pin
  useEffect(() => {
    if (stage !== 0 && !valid) {
      setStage(1)
      setPin('')
    }
  }, [stage, valid])

  // 不合法提示：停笔 450ms 再显示；一旦合法/清空立即收起
  useEffect(() => {
    if (stage !== 1 || username === '' || valid) {
      setShowHint(false)
      return
    }
    const id = window.setTimeout(() => setShowHint(true), 450)
    return () => window.clearTimeout(id)
  }, [stage, username, valid])

  // 按钮从禁用变可用时，小弹一下
  useEffect(() => {
    const became = canPress && !wasReady.current
    wasReady.current = canPress
    if (!became) return
    setReadyPulse(true)
    const id = window.setTimeout(() => setReadyPulse(false), 300)
    return () => window.clearTimeout(id)
  }, [canPress])

  // 进入 pin 阶段后，点屏幕任意空白也能聚焦到密码（不必非点圆点）
  useEffect(() => {
    if (stage !== 2) return
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('button')) return
      e.preventDefault()
      pinRef.current?.focus()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [stage])

  // 卸载时清掉提示定时器
  useEffect(() => () => window.clearTimeout(pinHintTimer.current), [])

  // 输了非数字：提示「请输入数字」，1.4s 后自动收
  const warnNonDigit = () => {
    setPinHint(true)
    window.clearTimeout(pinHintTimer.current)
    pinHintTimer.current = window.setTimeout(() => setPinHint(false), 1400)
  }

  const onPinChange = (raw: string) => {
    if (/[^\d]/.test(raw)) {
      warnNonDigit()
    } else {
      setPinHint(false)
      window.clearTimeout(pinHintTimer.current)
    }
    setPin(raw.replace(/\D/g, '').slice(0, PIN_LEN))
  }

  // 按钮/回车统一走这里：进入 → 确认(username) → 登录(pin)
  const advance = () => {
    if (stage === 0) {
      setStage(1)
      return
    }
    if (stage === 1) {
      if (valid) setStage(2)
      return
    }
    if (pin.length === PIN_LEN) {
      login(username)
      navigate('/', { replace: true })
    }
  }

  return (
    <div className="page">
      <div className={`panel login-panel${stage === 2 ? ' stage-2' : ''}`}>
        <h1 className="brand">
          {BRANDS.map((name, i) => (
            <span key={name} className={i === idx ? 'on' : ''} aria-hidden={i !== idx}>
              {name}
            </span>
          ))}
        </h1>

        {/* 点「进入」后撑开；进 pin 阶段后 username 与 pin 在同一格交接 */}
        <div
          className={`login-field${stage !== 0 ? ' open' : ''}${stage === 2 ? ' pin-mode' : ''}`}
          aria-hidden={stage === 0}
        >
          <div className="login-face">
            <input
              ref={usernameRef}
              className="login-input"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="username"
              value={username}
              disabled={stage === 0}
              readOnly={stage === 2}
              tabIndex={stage === 1 ? 0 : -1}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && stage === 1) advance()
              }}
            />

            <div className="pin-dots">
              {Array.from({ length: PIN_LEN }, (_, i) => (
                <span key={i} className={`pin-dot${i < pin.length ? ' on' : ''}`} />
              ))}
              <input
                ref={pinRef}
                className="pin-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={PIN_LEN}
                value={pin}
                disabled={stage !== 2}
                tabIndex={stage === 2 ? 0 : -1}
                aria-label="pin"
                onChange={(e) => onPinChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') advance()
                }}
              />
            </div>
          </div>

          <p className={`login-hint${showHint ? ' show' : ''}`} aria-hidden={!showHint}>
            3–20 位，字母开头，仅小写字母与数字
          </p>
          <p className={`pin-hint${pinHint ? ' show' : ''}`} aria-hidden={!pinHint}>
            请输入数字
          </p>
        </div>

        <div className={`login-actions${stage === 2 ? ' two' : ''}`}>
          <button
            className="btn btn-ghost login-back"
            aria-hidden={stage !== 2}
            tabIndex={stage === 2 ? 0 : -1}
            onClick={() => {
              setStage(1)
              setPin('')
            }}
          >
            返回
          </button>
          <button
            className={`btn btn-primary${readyPulse ? ' ready' : ''}`}
            disabled={!canPress}
            onClick={advance}
          >
            {stage === 0 ? '进入' : stage === 1 ? '确认' : '登录'}
          </button>
        </div>
      </div>
    </div>
  )
}
