import { expect } from 'vitest'
import { POST as auth } from '../api/auth.ts'
import { POST as classes } from '../api/classes.ts'
import { POST as people } from '../api/people.ts'
import { Browser, PASSWORD, uniqueEmail } from './helpers.ts'

// Signed-in browsers for each role, built through the real API.

let adminBrowser: Browser | null = null

// The admin for this test file (the first account, made on the setup screen).
export async function admin(): Promise<Browser> {
  if (adminBrowser) return adminBrowser
  const b = new Browser()
  const res = await b.post(auth, { action: 'setup', name: 'Ada Admin', email: uniqueEmail('admin'), password: PASSWORD })
  expect(res.status).toBe(200)
  adminBrowser = b
  return b
}

export async function trainer(name = 'Terry Trainer'): Promise<Browser> {
  const invite = await (await admin()).post(people, { action: 'invite', role: 'trainer' })
  expect(invite.status).toBe(200)
  const b = new Browser()
  const res = await b.post(auth, {
    action: 'accept',
    token: invite.body.token,
    name,
    email: uniqueEmail('trainer'),
    password: PASSWORD,
  })
  expect(res.status).toBe(200)
  return b
}

export async function newClass(owner: Browser, name = `Class ${Date.now()}`) {
  const res = await owner.post(classes, { action: 'create', name })
  expect(res.status).toBe(200)
  return res.body.classInfo as { id: string; name: string; classCode: string }
}

export async function agent(classCode: string, name = 'Sam Lee', ip?: string): Promise<Browser & { email: string }> {
  const b = new Browser(ip) as Browser & { email: string }
  b.email = uniqueEmail('agent')
  const res = await b.post(auth, { action: 'signup', classCode, name, email: b.email, password: PASSWORD })
  expect(res.status).toBe(200)
  return b
}
