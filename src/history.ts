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
