import type { ClassDashboard, SavedAttempt } from '../shared/classes.ts'
import { exportClassCalls } from './api.ts'
import { attemptTitle, resultOf, scoreOf } from './history.ts'

type Cell = string | number | null | undefined

// Spreadsheet apps treat cells starting with = + - @ as formulas; prefix those so names
// and quotes from calls can never run as formulas.
function cell(value: Cell): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function downloadCsv(filename: string, rows: Cell[][]): void {
  // The byte-order mark makes Excel open the file as UTF-8.
  const csv = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n')
  downloadFile(filename, new Blob([csv], { type: 'text/csv;charset=utf-8' }))
}

export function downloadFile(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const fileSafe = (name: string) => name.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'class'
const today = () => new Date().toISOString().slice(0, 10)

const RESULT = { pass: 'Pass', needs_work: 'Needs work', fail: 'Fail' } as const

// Every scored call in the class (fetched in full, not just the calls on screen), one row per call.
export async function downloadResults(dashboard: ClassDashboard): Promise<void> {
  const attempts: SavedAttempt[] = await exportClassCalls(dashboard.classInfo.id)
  const rows: Cell[][] = [
    ['Date', 'Agent', 'Scenario', 'Score', 'Result', 'AI score', 'Trainer note', 'Rules broken', 'Missed steps', 'Minutes'],
    ...attempts.map((a) => [
      new Date(a.startedAt).toLocaleString(),
      a.agentName,
      attemptTitle(a),
      scoreOf(a),
      RESULT[resultOf(a)],
      Math.round(a.scorecard.overall_score),
      a.review?.note ?? '',
      a.scorecard.compliance
        .filter((c) => c.status === 'violation')
        .map((c) => c.rule)
        .join('; '),
      a.scorecard.steps
        .filter((s) => s.status === 'missed' || s.status === 'out_of_order')
        .map((s) => s.label)
        .join('; '),
      (a.durationSec / 60).toFixed(1),
    ]),
  ]
  downloadCsv(`${fileSafe(dashboard.classInfo.name)}-results-${today()}.csv`, rows)
}

// "Ready", "2 of 3", or blank when the class doesn't track readiness.
export function readiness(dashboard: ClassDashboard, userId: string): string {
  const required = dashboard.requirements.scenarioIds.length
  if (!required) return ''
  const done = dashboard.passed[userId]?.length ?? 0
  return done >= required ? 'Ready' : `${done} of ${required}`
}

// One row per agent: how much they've practiced and how they're doing.
export function downloadRoster(dashboard: ClassDashboard): void {
  const rows: Cell[][] = [
    ['Agent', 'Email', 'Calls', 'Average score', 'Calls passed', 'Ready for live calls', 'Last active'],
    ...dashboard.agents.map((agent) => {
      const calls = dashboard.attempts.filter((a) => a.userId === agent.id)
      const avg = calls.length
        ? Math.round(calls.reduce((n, a) => n + scoreOf(a), 0) / calls.length)
        : null
      return [
        agent.name,
        agent.email,
        calls.length,
        avg,
        calls.filter((a) => resultOf(a) === 'pass').length,
        readiness(dashboard, agent.id),
        agent.lastSeenAt ? new Date(agent.lastSeenAt).toLocaleDateString() : '',
      ]
    }),
  ]
  downloadCsv(`${fileSafe(dashboard.classInfo.name)}-agents-${today()}.csv`, rows)
}
