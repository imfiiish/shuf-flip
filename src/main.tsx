import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { migrateLegacy } from './lib/migrate'

// 渲染前先清理旧存档（幂等）
migrateLegacy()

// getElementById 可能返回 null，TS 下需要断言（或判空）
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
