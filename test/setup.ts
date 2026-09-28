import { readFileSync } from 'node:fs'
import postgres from 'postgres'
import { afterAll, beforeEach } from 'vitest'
import { startFakeAnthropic, type FakeAnthropic } from './fakeAnthropic.ts'

// Every test file talks to a fake Anthropic API. Set before any server module is imported.
const fake = await startFakeAnthropic()
process.env.ANTHROPIC_BASE_URL = fake.url
process.env.ANTHROPIC_API_KEY = 'test-key'
;(globalThis as { fakeAnthropic?: FakeAnthropic }).fakeAnthropic = fake

// Database tests run only when TEST_DATABASE_URL points at a throwaway Postgres database.
const testDb = process.env.TEST_DATABASE_URL
if (testDb) {
  process.env.DATABASE_URL = testDb
  const sql = postgres(testDb, { max: 1, onnotice: () => {} })
  await sql.unsafe(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'))
  // Each test file starts from an empty database, so the first account made becomes the admin.
  await sql`truncate users, sessions, account_links, classes, attempts, scenarios, ai_usage cascade`
  await sql.end()
} else {
  delete process.env.DATABASE_URL
}

beforeEach(() => {
  fake.setMode('ok')
  fake.requests.length = 0
})

afterAll(async () => {
  await fake.close()
})
