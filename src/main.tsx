import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { migrateLegacy } from './lib/migrate'
import { loadWords } from './data/words'

// 渲染前先清理旧存档（幂等）
migrateLegacy()

const root = createRoot(document.getElementById('root')!)

// 词库是运行时加载的，加载完再挂应用
loadWords().then(
  () => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  },
  (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    root.render(<div className="load-error">词库加载失败：{msg}</div>)
  },
)
