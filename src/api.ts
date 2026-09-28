import type { ClassDashboard, ClassInfo } from '../shared/classes.ts'
import type { ScorecardResult } from '../shared/scorecard.ts'
import type { Turn } from '../shared/scenarios.ts'

export type Scorecard = ScorecardResult

async function post<T>(path: string, body: object): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)
  return data as T
}

export async function getProspectReply(scenarioId: string, transcript: Turn[]): Promise<string> {
  const { text } = await post<{ text: string }>('/api/coach', { action: 'reply', scenarioId, transcript })
  return text
}

export interface ClassSave {
  classCode: string
  agentName: string
  startedAt: string
  durationSec: number
}

export interface ScoreResult {
  scorecard: Scorecard
  saved: boolean
  attemptId?: string
  saveError?: string
}

export function scoreCall(scenarioId: string, transcript: Turn[], classSave?: ClassSave): Promise<ScoreResult> {
  return post<ScoreResult>('/api/coach', { action: 'score', scenarioId, transcript, ...classSave })
}

export async function createClass(name: string): Promise<{ classInfo: ClassInfo; trainerKey: string }> {
  return post('/api/classes', { action: 'create', name })
}

export async function joinClass(classCode: string): Promise<ClassInfo> {
  const { classInfo } = await post<{ classInfo: ClassInfo }>('/api/classes', { action: 'join', classCode })
  return classInfo
}

export function loadDashboard(trainerKey: string): Promise<ClassDashboard> {
  return post('/api/classes', { action: 'dashboard', trainerKey })
}
