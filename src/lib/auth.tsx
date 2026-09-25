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
import { pullBooks } from './books'
import { clearLocalState } from './sync'

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
          try {
            await pullBooks() // 拉到词书，Home 才能同步读到
          } catch {
            /* 拉词书失败不阻塞进入 */
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
      await api.logout()
    } catch {
      /* 网络异常也照常本地登出 */
    }
    clearLocalState() // 服务器才是权威；下次登录重新开始
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
