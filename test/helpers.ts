import { randomUUID } from 'node:crypto'
import type { FakeAnthropic } from './fakeAnthropic.ts'

export const fake = () => (globalThis as { fakeAnthropic?: FakeAnthropic }).fakeAnthropic!

export const hasDb = !!process.env.TEST_DATABASE_URL

// A fresh caller IP per test keeps per-computer limits from leaking between tests.
export const newIp = () => `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${randomUUID().length}`

type Handler = (request: Request) => Promise<Response>
export type Result = { status: number; body: Record<string, any>; cookie: string | null }

async function send(handler: Handler, request: Request): Promise<Result> {
  const response = await handler(request)
  return {
    status: response.status,
    body: (await response.json()) as Record<string, any>,
    cookie: response.headers.get('set-cookie'),
  }
}

// One browser: keeps its session cookie between requests, like a real one.
export class Browser {
  cookie = ''
  constructor(readonly ip = newIp()) {}

  private headers(json: boolean) {
    const h: Record<string, string> = { 'x-forwarded-for': this.ip }
    if (json) h['content-type'] = 'application/json'
    if (this.cookie) h.cookie = this.cookie
    return h
  }

  private keep(result: Result) {
    const value = result.cookie?.match(/^cc_session=([^;]*)/)?.[1]
    if (value !== undefined) this.cookie = value ? `cc_session=${value}` : ''
    return result
  }

  async post(handler: Handler, body: unknown): Promise<Result> {
    const request = new Request('http://localhost/api', {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify(body),
    })
    return this.keep(await send(handler, request))
  }

  async get(handler: Handler): Promise<Result> {
    return this.keep(await send(handler, new Request('http://localhost/api', { headers: this.headers(false) })))
  }
}

// Requests from a browser that isn't signed in.
export const call = (handler: Handler, body: unknown, ip = newIp()) => new Browser(ip).post(handler, body)
export const get = (handler: Handler, ip = newIp()) => new Browser(ip).get(handler)

export const agentTurn = (text = 'Hi, this is Sam Lee calling from Lakeview State University.') => [
  { speaker: 'agent', text },
]

export const PASSWORD = 'correct horse battery'
export const uniqueEmail = (who: string) => `${who}.${randomUUID().slice(0, 8)}@example.com`

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
