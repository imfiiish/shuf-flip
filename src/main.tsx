import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { hydrate } from './lib/persist'
import { loadIndex } from './data/words'

const root = createRoot(document.getElementById('root')!)

// 先渲染：立刻给出反馈（词库走 API，可能受网络影响），就绪后再挂应用
root.render(<div className="load-error">加载中…</div>)

// 词库 + 持久层都是异步的就绪条件，齐了再挂应用
Promise.all([loadIndex(), hydrate()]).then(
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
