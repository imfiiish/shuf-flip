import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { migrateLegacy } from './lib/migrate'
import { hydrate } from './lib/persist'
import { loadWords } from './data/words'

// 渲染前先清理旧存档（幂等）
migrateLegacy()

const root = createRoot(document.getElementById('root')!)

// 词库 + 持久层都是异步的就绪条件，齐了再挂应用
Promise.all([loadWords(), hydrate()]).then(
  () => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  },
  (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    root.render(<div className="load-error">初始化失败：{msg}</div>)
  },
)
