import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { env } from './env'
import { auth } from './routes/auth'
import { words } from './routes/words'
import { study } from './routes/study'
import { books } from './routes/books'

const app = new Hono()

app.use('*', logger())
app.get('/api/health', (c) => c.json({ ok: true }))
app.route('/api/auth', auth)
app.route('/api/words', words)
app.route('/api/study', study)
app.route('/api/books', books)

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`)
})
