import type { SavedAttempt } from '../shared/classes.ts'
import { getScenario } from '../shared/scenarios.ts'

export type Attempt = SavedAttempt

// Title to show for a call, including calls on trainer-built scenarios.
export function attemptTitle(attempt: Attempt): string {
  return attempt.scenarioTitle ?? getScenario(attempt.scenarioId)?.title ?? 'Custom scenario'
}

// The score and result that count: a trainer's correction wins over the AI's.
export function scoreOf(attempt: Attempt): number {
  return Math.round(attempt.review?.score ?? attempt.scorecard.overall_score)
}

export function resultOf(attempt: Attempt): Attempt['scorecard']['result'] {
  return attempt.review?.result ?? attempt.scorecard.result
}

// Who made a call: the account when known (so two people with the same name stay apart), else the name.
export const personKey = (attempt: Attempt): string => attempt.userId ?? `name:${attempt.agentName}`

// Each person in a list of calls, with the name from their most recent call, sorted by name.
export function peopleIn(attempts: Attempt[]): { key: string; name: string }[] {
  const people = new Map<string, string>()
  for (const a of attempts) if (!people.has(personKey(a))) people.set(personKey(a), a.agentName)
  return [...people].map(([key, name]) => ({ key, name })).sort((x, y) => x.name.localeCompare(y.name))
}
