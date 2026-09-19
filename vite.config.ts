import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const LOG_DIR = join(dirname(fileURLToPath(import.meta.url)), 'logs')

/** dev 期把前端事件按逻辑日 + 页面（study/quiz）追加到 logs/events-<page>-<ld>.jsonl */
function eventLogPlugin(): Plugin {
  return {
    name: 'vocab-event-log',
    configureServer(server) {
      server.middlewares.use('/__events', (req, res, next) => {
        if (req.method !== 'POST') return next()
        let body = ''
        req.setEncoding('utf8')
        req.on('data', (chunk: string) => {
          body += chunk
        })
        req.on('end', () => {
          try {
            mkdirSync(LOG_DIR, { recursive: true })
            for (const line of body.split('\n')) {
              if (!line.trim()) continue
              const obj = JSON.parse(line) as { ld?: unknown; type?: unknown }
              const ld =
                typeof obj.ld === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.ld)
                  ? obj.ld
                  : 'unknown'
              // event_study 与 event_quiz 分开：按 type 前缀落到不同文件
              const page =
                typeof obj.type === 'string' && obj.type.startsWith('quiz_')
                  ? 'quiz'
                  : 'study'
              appendFileSync(
                join(LOG_DIR, `events-${page}-${ld}.jsonl`),
                line + '\n',
              )
            }
          } catch {
            /* 坏行忽略 */
          }
          res.statusCode = 204
          res.end()
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), eventLogPlugin()],
})
