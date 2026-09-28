import { randomUUID } from 'node:crypto'
import type { FakeAnthropic } from './fakeAnthropic.ts'

export const fake = () => (globalThis as { fakeAnthropic?: FakeAnthropic }).fakeAnthropic!

export const hasDb = !!process.env.TEST_DATABASE_URL

// A fresh caller IP per test keeps per-computer limits from leaking between tests.
export const newIp = () => `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${randomUUID().length}`

type Handler = (request: Request) => Promise<Response>

export async function call(handler: Handler, body: unknown, ip = newIp()) {
  const response = await handler(
    new Request('http://localhost/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify(body),
    }),
  )
  return { status: response.status, body: (await response.json()) as Record<string, any> }
}

export async function get(handler: Handler, ip = newIp()) {
  const response = await handler(new Request('http://localhost/api', { headers: { 'x-forwarded-for': ip } }))
  return { status: response.status, body: (await response.json()) as Record<string, any> }
}

export const agentTurn = (text = 'Hi, this is Sam Lee calling from Lakeview State University.') => [
  { speaker: 'agent', text },
]

// Temporarily set environment variables for one test.
export async function withEnv<T>(vars: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try {
    return await run()
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}
