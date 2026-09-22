import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const LOG_DIR = join(dirname(fileURLToPath(import.meta.url)), 'logs')

/** dev 期把前端事件按逻辑日 + 页面（study/quiz）追加到 logs/events-<page>-<ld>.jsonl
 *
 * 客户端格式（见 src/lib/analytics.ts）：
 *   会话头：{"h":1,"sid":…,"ld":"YYYY-MM-DD","p":"study|quiz","t0":…}
 *   事件：  [code, dt, …args]（code ≥10 = quiz）
 * 中间件按头行记住 ld，并按 code 判页；事件落盘前若该文件本会话还没有头，
 * 会先把头行插进去，保证每个文件都能独立解码。
 */
function eventLogPlugin(): Plugin {
  // 单用户 dev 服务，用闭包状态记住当前会话头 / 已写头的文件
  let curLd = ''
  let curHeader: Record<string, unknown> | null = null
  const headed = new Set<string>()

  /** 写头行（p 换成目标页） */
  const writeHeader = (file: string, page: string) => {
    if (!curHeader) return
    appendFileSync(file, JSON.stringify({ ...curHeader, p: page }) + '\n')
    headed.add(file)
  }

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
              const v = JSON.parse(line) as unknown

              // 会话头：记住 ld/原文，路由到它自己的页
              if (v && typeof v === 'object' && !Array.isArray(v)) {
                const o = v as { h?: unknown; ld?: unknown; p?: unknown }
                if (o.h !== 1) continue
                const ld =
                  typeof o.ld === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.ld)
                    ? o.ld
                    : 'unknown'
                const page = o.p === 'quiz' ? 'quiz' : 'study'
                curLd = ld
                curHeader = { ...o, ld }
                headed.clear()
                const file = join(LOG_DIR, `events-${page}-${ld}.jsonl`)
                writeHeader(file, page)
                continue
              }

              // 事件元组：code 判页，ld 用当前头
              if (Array.isArray(v)) {
                const code = v[0]
                const page =
                  typeof code === 'number' && code >= 10 ? 'quiz' : 'study'
                const ld = curLd || 'unknown'
                const file = join(LOG_DIR, `events-${page}-${ld}.jsonl`)
                if (!headed.has(file)) writeHeader(file, page)
                appendFileSync(file, line + '\n')
              }
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
