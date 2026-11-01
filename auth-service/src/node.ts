import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { type AuthEnv, createApp } from './app.ts'

/**
 * Standalone server for Node or Bun, for running on your own machine instead
 * of Cloudflare. Configure it with environment variables (or a .dev.vars file,
 * see the package scripts). With STATIC_DIR pointing at the built frontend it
 * serves the whole app; without it, only /api/auth.
 */

const env = process.env as AuthEnv & { PORT?: string; HOST?: string; STATIC_DIR?: string }
const server = new Hono()
server.route('/', createApp(env))
// Unknown API paths stay JSON 404s instead of falling through to the app below.
server.all('/api/*', (c) => c.json({ error: 'not_found' }, 404))

if (env.STATIC_DIR) {
  server.use('*', serveStatic({ root: env.STATIC_DIR }))
  // Single-page app: unknown paths get index.html and the router takes over.
  server.get('*', serveStatic({ path: `${env.STATIC_DIR}/index.html` }))
}

const port = Number(env.PORT ?? 8787)
serve({ fetch: server.fetch, port, hostname: env.HOST ?? '0.0.0.0' }, () => {
  const mode = env.STATIC_DIR ? `app from ${env.STATIC_DIR} and /api/auth` : '/api/auth'
  console.log(`Wallet auth service: ${mode} on http://localhost:${port}`)
})
