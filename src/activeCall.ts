import type { ClassInfo } from '../shared/classes.ts'
import type { CallFlow } from '../shared/flows.ts'
import type { Scenario, Turn } from '../shared/scenarios.ts'

// The call in progress, kept in this browser so a refresh or crash doesn't lose it.
export interface SavedCall {
  userId: string
  scenario: Scenario
  flow: CallFlow
  preview: ClassInfo | null
  transcript: Turn[]
  startedAt: string
  elapsed: number
  endNote: string | null
  savedAt: number
}

const KEY = 'callcraft.activeCall.v1'
// Older unfinished calls are dropped rather than offered back.
const MAX_AGE_MS = 6 * 60 * 60 * 1000

// Storage can be unavailable (private mode, blocked site data); calls still work without it.
export function saveActiveCall(call: Omit<SavedCall, 'savedAt'>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...call, savedAt: Date.now() }))
  } catch {
    // Ignore storage failures.
  }
}

export function loadActiveCall(userId: string): SavedCall | null {
  try {
    const raw = localStorage.getItem(KEY)
    const call = raw ? (JSON.parse(raw) as SavedCall) : null
    if (!call || call.userId !== userId || Date.now() - call.savedAt > MAX_AGE_MS || !call.transcript?.length) {
      return null
    }
    return call
  } catch {
    return null
  }
}

export function clearActiveCall(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Ignore storage failures.
  }
}
