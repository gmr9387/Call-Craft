import react from '@vitejs/plugin-react'
import type { IncomingMessage } from 'node:http'
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

// Serves the /api/* Vercel functions during `vite dev`, so local development
// runs the same handlers as production.
function apiDevServer(): Plugin {
  return {
    name: 'callcraft-api-dev',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api', async (req, res, next) => {
        const name = req.url?.replace(/^\//, '').split('?')[0]
        if (name !== 'coach' && name !== 'classes') return next()
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        const mod = await server.ssrLoadModule(`/api/${name}.ts`)
        const request = new Request(`http://localhost/api/${name}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: await readBody(req),
        })
        const response: Response = await mod.POST(request)
        res.statusCode = response.status
        res.setHeader('content-type', response.headers.get('content-type') ?? 'application/json')
        res.end(await response.text())
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Make ANTHROPIC_API_KEY / CALLCRAFT_MODEL / DATABASE_URL from .env files visible to the dev API.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ['ANTHROPIC_', 'CALLCRAFT_', 'DATABASE_']))
  return {
    plugins: [react(), apiDevServer()],
  }
})
