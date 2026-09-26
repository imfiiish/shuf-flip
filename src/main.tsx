import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { hydrate } from './lib/persist'
import { detectLang, translate } from './lib/i18n'
import { loadAllIndices } from './data/words'
import { primeAudio } from './lib/audio'

// 首次用户手势就预热音频输出（早于学习页首次出声），避免第一声被吃掉开头
const onFirstGesture = () => primeAudio()
window.addEventListener('pointerdown', onFirstGesture, {
  capture: true,
  once: true,
})
window.addEventListener('keydown', onFirstGesture, { capture: true, once: true })

const root = createRoot(document.getElementById('root')!)
const lang = detectLang()

// 先渲染：立刻给出反馈（词库走 API，可能受网络影响），就绪后再挂应用
root.render(<div className="load-error">{translate(lang, 'app.loading')}</div>)

// 词库（中英两套）+ 持久层都是异步的就绪条件，齐了再挂应用
Promise.all([loadAllIndices(), hydrate()]).then(
  () => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  },
  (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    root.render(
      <div className="load-error">
        {translate(lang, 'app.initFailed', { msg })}
      </div>,
    )
  },
)
