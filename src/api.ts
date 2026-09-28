import type { AuthStatus, LinkInfo, Me, Person } from '../shared/accounts.ts'
import type { ClassDashboard, ClassInfo, ClassSummary, JoinResult, SavedAttempt } from '../shared/classes.ts'
import type { ScenarioInputValue } from '../shared/scenarioInput.ts'
import type { Scenario, Turn } from '../shared/scenarios.ts'
import type { ScorecardResult } from '../shared/scorecard.ts'

export type Scorecard = ScorecardResult
export type ScenarioFields = ScenarioInputValue

// Fired when the server says the session is gone, so the app can show the sign-in page.
export const SIGNED_OUT_EVENT = 'callcraft:signed-out'

async function handle<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}))
  if (res.status === 401 && data.error === 'Please sign in again.') window.dispatchEvent(new Event(SIGNED_OUT_EVENT))
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)
  return data as T
}

async function post<T>(path: string, body: object): Promise<T> {
  return handle<T>(
    await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

async function get<T>(path: string): Promise<T> {
  return handle<T>(await fetch(path))
}

// ---- Accounts ----

export const authStatus = () => get<AuthStatus>('/api/auth')

type Fields = { name: string; email: string; password: string }

export const login = (email: string, password: string) =>
  post<{ user: Me }>('/api/auth', { action: 'login', email, password })
export const logout = () => post('/api/auth', { action: 'logout' })
export const setupAdmin = (fields: Fields) => post<{ user: Me }>('/api/auth', { action: 'setup', ...fields })
export const signUp = (classCode: string, fields: Fields) =>
  post<{ user: Me }>('/api/auth', { action: 'signup', classCode, ...fields })
export const linkInfo = (token: string) => post<{ link: LinkInfo }>('/api/auth', { action: 'link', token })
export const acceptInvite = (token: string, fields: Fields) =>
  post<{ user: Me }>('/api/auth', { action: 'accept', token, ...fields })
export const resetPassword = (token: string, password: string) =>
  post<{ user: Me }>('/api/auth', { action: 'reset', token, password })
export const changePassword = (currentPassword: string, newPassword: string) =>
  post('/api/auth', { action: 'password', currentPassword, newPassword })

// A link to copy and send: an invite, a password reset, or an agent sign-up for a class.
export const shareLink = (kind: 'invite' | 'reset' | 'join', value: string) =>
  `${window.location.origin}/?${kind}=${encodeURIComponent(value)}`

export async function listPeople(): Promise<Person[]> {
  return (await post<{ people: Person[] }>('/api/people', { action: 'list' })).people
}

export async function inviteLink(role: 'trainer' | 'admin'): Promise<string> {
  return shareLink('invite', (await post<{ token: string }>('/api/people', { action: 'invite', role })).token)
}

export async function resetLink(userId: string): Promise<string> {
  return shareLink('reset', (await post<{ token: string }>('/api/people', { action: 'reset-link', userId })).token)
}

export const setDisabled = (userId: string, disabled: boolean) =>
  post('/api/people', { action: 'disable', userId, disabled })

// ---- Practice calls ----

export async function getProspectReply(scenarioId: string, transcript: Turn[]): Promise<string> {
  const { text } = await post<{ text: string }>('/api/coach', { action: 'reply', scenarioId, transcript })
  return text
}

export interface ScoreOptions {
  // False for trainer preview calls.
  save: boolean
  startedAt: string
  durationSec: number
}

export interface ScoreResult {
  scorecard: Scorecard
  saved: boolean
  attemptId?: string
  // The class the call was saved to, if any.
  className?: string | null
  saveError?: string
}

export function scoreCall(scenarioId: string, transcript: Turn[], options: ScoreOptions): Promise<ScoreResult> {
  return post<ScoreResult>('/api/coach', { action: 'score', scenarioId, transcript, ...options })
}

export async function myCalls(): Promise<SavedAttempt[]> {
  return (await get<{ attempts: SavedAttempt[] }>('/api/calls')).attempts
}

// ---- Classes ----

export async function listClasses(): Promise<ClassSummary[]> {
  return (await post<{ classes: ClassSummary[] }>('/api/classes', { action: 'list' })).classes
}

export async function createClass(name: string): Promise<ClassInfo> {
  return (await post<{ classInfo: ClassInfo }>('/api/classes', { action: 'create', name })).classInfo
}

export const loadDashboard = (classId: string) => post<ClassDashboard>('/api/classes', { action: 'dashboard', classId })

export const removeAgent = (classId: string, userId: string) =>
  post('/api/classes', { action: 'remove-agent', classId, userId })

export async function myClass(): Promise<JoinResult | null> {
  return (await post<{ joined: JoinResult | null }>('/api/classes', { action: 'mine' })).joined
}

export const joinClass = (classCode: string) => post<JoinResult>('/api/classes', { action: 'join', classCode })

// ---- Scenario builder ----

export async function draftScenario(classId: string, description: string): Promise<ScenarioFields> {
  const { draft } = await post<{ draft: ScenarioFields }>('/api/scenarios', { action: 'draft', classId, description })
  return draft
}

export async function saveScenario(classId: string, fields: ScenarioFields, id?: string): Promise<Scenario> {
  const { scenario } = await post<{ scenario: Scenario }>('/api/scenarios', {
    action: id ? 'update' : 'create',
    classId,
    id,
    scenario: fields,
  })
  return scenario
}

export async function archiveScenario(classId: string, id: string, archived: boolean): Promise<Scenario> {
  const { scenario } = await post<{ scenario: Scenario }>('/api/scenarios', { action: 'archive', classId, id, archived })
  return scenario
}
