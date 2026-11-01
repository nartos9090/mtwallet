import { type AuthEnv, createApp } from './app.ts'

/**
 * Cloudflare Worker entry (see wrangler.jsonc at the repo root). Static files
 * of the frontend are served by Workers static assets; only /api/* runs this.
 */

interface Env extends AuthEnv {
  ASSETS: { fetch(request: Request): Promise<Response> }
}

let app: ReturnType<typeof createApp> | undefined

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    app ??= createApp(env)
    if (new URL(request.url).pathname.startsWith('/api/')) return app.fetch(request)
    return env.ASSETS.fetch(request)
  },
}
