import type { ClassDashboard, ClassInfo, JoinResult } from '../shared/classes.ts'
import type { ScenarioInputValue } from '../shared/scenarioInput.ts'
import type { Scenario, Turn } from '../shared/scenarios.ts'
import type { ScorecardResult } from '../shared/scorecard.ts'

export type Scorecard = ScorecardResult
export type ScenarioFields = ScenarioInputValue

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

export async function getProspectReply(scenarioId: string, transcript: Turn[], classCode?: string): Promise<string> {
  const { text } = await post<{ text: string }>('/api/coach', { action: 'reply', scenarioId, transcript, classCode })
  return text
}

export interface ScoreOptions {
  // Needed for trainer-built scenarios, and to save the call to a class.
  classCode?: string
  saveToClass: boolean
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

export function scoreCall(scenarioId: string, transcript: Turn[], options: ScoreOptions): Promise<ScoreResult> {
  return post<ScoreResult>('/api/coach', { action: 'score', scenarioId, transcript, ...options })
}

export async function createClass(name: string): Promise<{ classInfo: ClassInfo; trainerKey: string }> {
  return post('/api/classes', { action: 'create', name })
}

export function joinClass(classCode: string): Promise<JoinResult> {
  return post('/api/classes', { action: 'join', classCode })
}

export function loadDashboard(trainerKey: string): Promise<ClassDashboard> {
  return post('/api/classes', { action: 'dashboard', trainerKey })
}

export async function draftScenario(trainerKey: string, description: string): Promise<ScenarioFields> {
  const { draft } = await post<{ draft: ScenarioFields }>('/api/scenarios', { action: 'draft', trainerKey, description })
  return draft
}

export async function saveScenario(trainerKey: string, fields: ScenarioFields, id?: string): Promise<Scenario> {
  const { scenario } = await post<{ scenario: Scenario }>('/api/scenarios', {
    action: id ? 'update' : 'create',
    trainerKey,
    id,
    scenario: fields,
  })
  return scenario
}

export async function archiveScenario(trainerKey: string, id: string, archived: boolean): Promise<Scenario> {
  const { scenario } = await post<{ scenario: Scenario }>('/api/scenarios', { action: 'archive', trainerKey, id, archived })
  return scenario
}
