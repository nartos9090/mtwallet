/**
 * Deploys to Cloudflare on the domain in frontend/.env (VITE_APP_URL), so the
 * domain lives next to the rest of the app's settings instead of in
 * wrangler.jsonc. Without it, deploys to the Worker's workers.dev address.
 * Extra arguments go to wrangler, e.g. `bun run deploy -- --dry-run`.
 *
 * Run via `bun run deploy` at the repo root, which builds first and loads frontend/.env.
 */
const appUrl = process.env.VITE_APP_URL
const args = ['wrangler', 'deploy', ...process.argv.slice(2)]

if (appUrl) {
  const { protocol, hostname } = new URL(appUrl)
  if (protocol !== 'https:') {
    console.error(`VITE_APP_URL must be https (got ${appUrl}).`)
    process.exit(1)
  }
  // Cloudflare creates the DNS record and certificate for a custom domain.
  args.push('--domain', hostname)
  console.log(`Deploying to ${hostname}`)
} else {
  console.log('VITE_APP_URL is not set in frontend/.env: deploying to the workers.dev address only.')
}

const result = Bun.spawnSync(['bunx', ...args], { stdio: ['inherit', 'inherit', 'inherit'] })
process.exit(result.exitCode)
