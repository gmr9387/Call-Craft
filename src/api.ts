import type { ScorecardResult } from '../shared/scorecard.ts'
import type { Turn } from '../shared/scenarios.ts'

export type Scorecard = ScorecardResult

async function post<T>(body: object): Promise<T> {
  const res = await fetch('/api/coach', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)
  return data as T
}

export async function getProspectReply(scenarioId: string, transcript: Turn[]): Promise<string> {
  const { text } = await post<{ text: string }>({ action: 'reply', scenarioId, transcript })
  return text
}

export async function scoreCall(scenarioId: string, transcript: Turn[]): Promise<Scorecard> {
  const { scorecard } = await post<{ scorecard: Scorecard }>({ action: 'score', scenarioId, transcript })
  return scorecard
}
