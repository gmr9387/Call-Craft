import type { ClassInfo, SavedAttempt } from '../shared/classes.ts'

export type Attempt = SavedAttempt

const KEY = 'callcraft.attempts.v1'
const NAME_KEY = 'callcraft.agentName'
const CLASS_KEY = 'callcraft.class'
const TRAINER_KEY = 'callcraft.trainerKey'

// Storage can be unavailable (private mode, blocked site data); the app still works without it.
function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Ignore storage failures.
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = read(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function loadAttempts(): Attempt[] {
  return readJson<Attempt[]>(KEY, [])
}

export function saveAttempt(attempt: Attempt): void {
  write(KEY, JSON.stringify([attempt, ...loadAttempts()].slice(0, 200)))
}

export function clearAttempts(): void {
  write(KEY, null)
}

export function loadAgentName(): string {
  return read(NAME_KEY) ?? ''
}

export function saveAgentName(name: string): void {
  write(NAME_KEY, name)
}

export function loadJoinedClass(): ClassInfo | null {
  return readJson<ClassInfo | null>(CLASS_KEY, null)
}

export function saveJoinedClass(info: ClassInfo | null): void {
  write(CLASS_KEY, info ? JSON.stringify(info) : null)
}

export function loadTrainerKey(): string {
  return read(TRAINER_KEY) ?? ''
}

export function saveTrainerKey(key: string | null): void {
  write(TRAINER_KEY, key)
}
