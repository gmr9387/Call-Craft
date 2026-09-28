import type { Scorecard } from './api.ts'
import type { Turn } from '../shared/scenarios.ts'

export interface Attempt {
  id: string
  agentName: string
  scenarioId: string
  startedAt: string
  durationSec: number
  transcript: Turn[]
  scorecard: Scorecard
}

const KEY = 'callcraft.attempts.v1'
const NAME_KEY = 'callcraft.agentName'

// Storage can be unavailable (private mode, blocked site data); the app still works without it.
export function loadAttempts(): Attempt[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Attempt[]) : []
  } catch {
    return []
  }
}

export function saveAttempt(attempt: Attempt): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([attempt, ...loadAttempts()].slice(0, 200)))
  } catch {
    // Ignore storage failures.
  }
}

export function clearAttempts(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Ignore storage failures.
  }
}

export function loadAgentName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveAgentName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch {
    // Ignore storage failures.
  }
}
