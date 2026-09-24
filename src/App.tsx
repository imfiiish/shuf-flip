import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SessionProvider, useSession } from './lib/auth'
import Home from './pages/Home'
import Login from './pages/Login'
import Study from './pages/Study'
import Quiz from './pages/Quiz'

// 未登录访问受保护页面时，重定向回 /login（会话校验期间先不渲染）
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useSession()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <SessionProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Home />
            </RequireAuth>
          }
        />
        <Route
          path="/study"
          element={
            <RequireAuth>
              <Study />
            </RequireAuth>
          }
        />
        <Route
          path="/quiz"
          element={
            <RequireAuth>
              <Quiz />
            </RequireAuth>
          }
        />
        {/* 未知路径一律回主页（未登录会被再重定向到登录页） */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </SessionProvider>
  )
}
