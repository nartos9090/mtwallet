/**
 * For embedding in an existing server. With Express, for example:
 *
 *   import { getRequestListener } from '@hono/node-server'
 *   import { BASE_PATH, createApp } from 'wallet-auth-service'
 *
 *   const auth = getRequestListener(createApp(process.env).fetch)
 *   expressApp.all(`${BASE_PATH}/*`, (req, res) => auth(req, res))
 */
export { type AuthEnv, BASE_PATH, createApp } from './app.ts'
