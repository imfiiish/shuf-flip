import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { migrateIndexIds } from './lib/migrate'

// 渲染前先把旧的下标型存档迁移成 word 型（幂等）
migrateIndexIds()

// getElementById 可能返回 null，TS 下需要断言（或判空）
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
