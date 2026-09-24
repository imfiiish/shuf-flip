import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../lib/auth'

// 登录页品牌名：中英交替显示
const BRANDS = ['Shuf & Flip', '洗牌 · 翻牌'] as const

// 与后端一致：3–20 位，字母开头，仅小写字母/数字
const USERNAME_RE = /^[a-z][a-z0-9]{2,19}$/
const PASSWORD_LEN = 4

export default function Login() {
  const navigate = useNavigate()
  const [idx, setIdx] = useState(0)
  // 0=进入；1=username（确认）；2=密码（进入）；3=再输一次密码确认（注册）
  const [stage, setStage] = useState<0 | 1 | 2 | 3>(0)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  // 第一次输入的密码，注册确认时比对
  const [pass1, setPass1] = useState('')
  // 密码步的常驻提示（如「再输入密码」）
  const [passwordLabel, setPasswordLabel] = useState('')
  // 中文/组合输入中：暂时用原生文字显示（逐字淡入层会让开）
  const [composing, setComposing] = useState(false)
  // username 校验提示：停笔一下才显示
  const [showHint, setShowHint] = useState(false)
  // 密码步临时提示（请输入数字 / 两次不一致）
  const [passwordHint, setPasswordHint] = useState('')
  // 刚变可点（disabled → enabled）时给按钮一个「就绪」小反馈
  const [readyPulse, setReadyPulse] = useState(false)
  const usernameRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const trailRef = useRef<HTMLCanvasElement>(null)
  const measureRef = useRef<HTMLSpanElement>(null)
  const wasReady = useRef(true)
  const passwordHintTimer = useRef<number | undefined>(undefined)

  const valid = USERNAME_RE.test(username)
  // 按钮是否可点：未展开时可（进入）；username 步要合法；password 步要满 4 位
  const canPress = stage === 0 || (stage === 1 ? valid : password.length === PASSWORD_LEN)

  useEffect(() => {
    const id = window.setInterval(() => {
      setIdx((v) => (v + 1) % BRANDS.length)
    }, 2600)
    return () => window.clearInterval(id)
  }, [])

  // 每步自动聚焦
  useEffect(() => {
    if (stage === 1) usernameRef.current?.focus()
    else if (stage >= 2) passwordRef.current?.focus()
  }, [stage])

  // kitty 式光标：canvas 画弹簧光标 + 按时间衰减的余晖（仅 username 步）
  useEffect(() => {
    if (stage !== 1) return
    const canvas = trailRef.current
    const input = usernameRef.current
    const measure = measureRef.current
    if (!canvas || !input || !measure) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const K = 190 // 弹簧刚度
    const C = 30 // 阻尼：C≈30 临界阻尼，不冲过头（方案 C）
    const D = 200 // 彗尾时间窗口 ms
    const accent = () =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    const parseColor = (c: string): [number, number, number] => {
      const s = c.trim()
      if (s.startsWith('#')) {
        const h =
          s.length === 4
            ? '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]
            : s
        return [
          parseInt(h.slice(1, 3), 16),
          parseInt(h.slice(3, 5), 16),
          parseInt(h.slice(5, 7), 16),
        ]
      }
      const m = s.match(/\d+/g)
      return m ? [Number(m[0]), Number(m[1]), Number(m[2])] : [122, 95, 54]
    }

    let x = 0
    let v = 0
    let started = false
    let raf = 0
    let lastKey = ''
    let cachedTarget = 0
    const hist: { x: number; t: number }[] = []

    const measureWidth = (text: string) => {
      measure.textContent = text
      return measure.getBoundingClientRect().width
    }

    // 居中文字里，光标在字符 pos 处的 x
    const targetX = () => {
      const r = canvas.getBoundingClientRect()
      const val = input.value
      const pos = input.selectionStart ?? val.length
      const key = val + '|' + pos + '|' + Math.round(r.width)
      if (key === lastKey) return cachedTarget
      lastKey = key
      const total = measureWidth(val)
      const prefix = measureWidth(val.slice(0, pos))
      measure.textContent = ''
      cachedTarget = r.width / 2 - total / 2 + prefix
      return cachedTarget
    }

    const frame = () => {
      const r = canvas.getBoundingClientRect()
      const cw = Math.round(r.width * dpr)
      const ch = Math.round(r.height * dpr)
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw
        canvas.height = ch
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        lastKey = ''
      }
      const w = r.width
      const h = r.height
      const tx = targetX()
      if (!started) {
        x = tx
        started = true
      }
      const dt = 1 / 60
      const a = K * (tx - x) - C * v
      v += a * dt
      x += v * dt

      // 每帧清空 + 画一条连续渐隐的“彗尾”（不留残影）
      const now = performance.now()
      hist.push({ x, t: now })
      const cutoff = now - D
      while (hist.length && hist[0].t < cutoff) hist.shift()
      if (hist.length > 90) hist.splice(0, hist.length - 90)

      ctx.clearRect(0, 0, w, h)
      const cy = h / 2 - 10
      const oldX = hist[0].x
      const [ar, ag, ab] = parseColor(accent())
      if (Math.abs(x - oldX) > 1.5) {
        const grad = ctx.createLinearGradient(oldX, 0, x, 0)
        for (let s = 0; s <= 8; s++) {
          const p = s / 8
          grad.addColorStop(p, `rgba(${ar},${ag},${ab},${Math.exp(-4 * (1 - p))})`)
        }
        ctx.fillStyle = grad
        const left = Math.min(oldX, x) - 1
        const right = Math.max(oldX, x) + 1
        ctx.fillRect(left, cy, right - left, 20)
      }
      ctx.fillStyle = accent()
      ctx.fillRect(x - 1, cy, 2, 20)

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [stage])

  // username 变得不合法 → 退回 username 步并清掉 password
  useEffect(() => {
    if (stage !== 0 && !valid) {
      setStage(1)
      setPassword('')
      setPass1('')
      setPasswordLabel('')
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

  // 点屏幕空白：username 步聚焦账号、password 步聚焦密码
  // （点输入框本身不拦截，保住正常放光标）
  useEffect(() => {
    if (stage === 0) return
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('button')) return
      if (stage === 1) {
        if (el.closest('.login-face')) return
        e.preventDefault()
        const input = usernameRef.current
        input?.focus()
        const n = input?.value.length ?? 0
        input?.setSelectionRange(n, n)
      } else {
        e.preventDefault()
        passwordRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [stage])

  // 卸载时清掉提示定时器
  useEffect(() => () => window.clearTimeout(passwordHintTimer.current), [])

  // 密码步临时提示：显示一会再自动收
  const showPasswordNote = (text: string, ms = 1500) => {
    setPasswordHint(text)
    window.clearTimeout(passwordHintTimer.current)
    passwordHintTimer.current = window.setTimeout(() => setPasswordHint(''), ms)
  }

  const onPasswordChange = (raw: string) => {
    if (/[^\d]/.test(raw)) {
      showPasswordNote('请输入数字')
    } else {
      setPasswordHint('')
      window.clearTimeout(passwordHintTimer.current)
    }
    setPassword(raw.replace(/\D/g, '').slice(0, PASSWORD_LEN))
  }

  // 按钮/回车统一走这里：进入 → 确认(username) → 进入(password) → 注册(再输一次)
  const advance = () => {
    if (stage === 0) {
      setStage(1)
      return
    }
    if (stage === 1) {
      if (valid) setStage(2)
      return
    }
    if (password.length !== PASSWORD_LEN) return
    if (stage === 2) {
      // 假设后台验证：没这个账号 → 转入注册，清空重输一次
      setPass1(password)
      setPassword('')
      setPasswordLabel('再输入密码')
      setStage(3)
      return
    }
    // stage 3：两次一致才注册成功
    if (password === pass1) {
      login(username)
      navigate('/', { replace: true })
    } else {
      showPasswordNote('两次不一致，请重输')
      setPassword('')
    }
  }

  return (
    <div className="page">
      <div className={`panel login-panel${stage >= 2 ? ' stage-2' : ''}`}>
        <h1 className="brand">
          {BRANDS.map((name, i) => (
            <span key={name} className={i === idx ? 'on' : ''} aria-hidden={i !== idx}>
              {name}
            </span>
          ))}
        </h1>

        {/* 点「进入」后撑开；进 password 阶段后 username 与 password 在同一格交接 */}
        <div
          className={`login-field${stage !== 0 ? ' open' : ''}${stage >= 2 ? ' password-mode' : ''}`}
          aria-hidden={stage === 0}
        >
          <div className="login-face">
            {/* kitty 式光标层：弹簧光标 + 衰减余晖 */}
            <canvas ref={trailRef} className="login-trail" aria-hidden="true" />
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
              readOnly={stage >= 2}
              tabIndex={stage === 1 ? 0 : -1}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={(e) => {
                setComposing(false)
                setUsername(e.currentTarget.value.toLowerCase())
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && stage === 1) advance()
              }}
            />

            {/* 逐字淡入的文字层（原生文字透明，只留这层可见） */}
            <span
              className={`login-value${composing ? ' composing' : ''}`}
              aria-hidden="true"
            >
              {username.split('').map((ch, i) => (
                <span key={i} className="login-char">
                  {ch}
                </span>
              ))}
            </span>

            {/* 隐藏量尺：量文字宽度，用来算光标位置 */}
            <span ref={measureRef} className="login-measure" aria-hidden="true" />

            <div className="password-dots">
              {Array.from({ length: PASSWORD_LEN }, (_, i) => (
                <span key={i} className={`password-dot${i < password.length ? ' on' : ''}`} />
              ))}
              <input
                ref={passwordRef}
                className="password-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={PASSWORD_LEN}
                value={password}
                disabled={stage < 2}
                tabIndex={stage >= 2 ? 0 : -1}
                aria-label="password"
                onChange={(e) => onPasswordChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') advance()
                }}
              />
            </div>
          </div>

          <p className={`login-hint${showHint ? ' show' : ''}`} aria-hidden={!showHint}>
            3–20 位，字母开头，仅小写字母与数字
          </p>
          <p className={`password-label${passwordLabel ? ' show' : ''}`} aria-hidden={!passwordLabel}>
            {passwordLabel}
          </p>
          <p className={`password-hint${passwordHint ? ' show' : ''}`} aria-hidden={!passwordHint}>
            {passwordHint}
          </p>
        </div>

        <div className={`login-actions${stage >= 2 ? ' two' : ''}`}>
          <button
            className="btn btn-ghost login-back"
            aria-hidden={stage < 2}
            tabIndex={stage >= 2 ? 0 : -1}
            onClick={() => {
              setStage(1)
              setPassword('')
              setPass1('')
              setPasswordLabel('')
            }}
          >
            返回
          </button>
          <button
            className={`btn btn-primary${readyPulse ? ' ready' : ''}`}
            disabled={!canPress}
            onClick={advance}
          >
            {stage === 1 ? '确认' : stage === 3 ? '注册' : '进入'}
          </button>
        </div>
      </div>
    </div>
  )
}
