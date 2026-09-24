// 登录态：应用启动时问一次后端「我是谁」，之后由登录/登出更新。
// 取代原来的 localStorage mock（isLoggedIn）。
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { api, type User } from './api'
import { clearLocalState, flushAll, pullState } from './sync'

type SessionValue = {
  user: User | null
  /** 首次校验会话是否还在进行 */
  loading: boolean
  setUser: (u: User | null) => void
  logout: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { user } = await api.me()
        if (!alive) return
        if (user) {
          // 已登录 → 先拉服务端状态再放行，保证看到的是最新的进度
          try {
            await pullState()
          } catch {
            /* 同步失败不阻塞进入 */
          }
          if (!alive) return
        }
        setUser(user)
      } catch {
        if (alive) setUser(null)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await flushAll() // 先把未推的推上去
    } catch {
      /* 忽略 */
    }
    try {
      await api.logout()
    } catch {
      /* 网络异常也照常本地登出 */
    }
    clearLocalState() // 服务器才是权威；下次登录再拉回
    setUser(null)
  }, [])

  return (
    <SessionContext.Provider value={{ user, loading, setUser, logout }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext)
  if (!v) throw new Error('useSession 必须在 SessionProvider 内使用')
  return v
}
