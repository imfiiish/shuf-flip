import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { env } from './env'
import { auth } from './routes/auth'
import { state } from './routes/state'
import { events } from './routes/events'

const app = new Hono()

app.use('*', logger())
app.get('/api/health', (c) => c.json({ ok: true }))
app.route('/api/auth', auth)
app.route('/api/state', state)
app.route('/api/events', events)

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`)
})
