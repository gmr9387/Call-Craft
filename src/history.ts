import type { SavedAttempt } from '../shared/classes.ts'
import { getScenario } from '../shared/scenarios.ts'

export type Attempt = SavedAttempt

// Title to show for a call, including calls on trainer-built scenarios.
export function attemptTitle(attempt: Attempt): string {
  return attempt.scenarioTitle ?? getScenario(attempt.scenarioId)?.title ?? 'Custom scenario'
}
