import { SCENARIOS, type Scenario } from '../../shared/scenarios.ts'
import { attemptTitle, type Attempt } from '../history.ts'

interface Props {
  attempts: Attempt[]
  onOpen: (attempt: Attempt) => void
  showAgents?: boolean
  // Trainer-built scenarios to list alongside the built-in ones.
  customScenarios?: Scenario[]
}

const RESULT_LABEL = { pass: '✓ Pass', needs_work: '! Needs work', fail: '✕ Fail' } as const

function average(nums: number[]): number | null {
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null
}

// The call-flow step an agent misses most often, to show trainers where to coach.
function mostMissedStep(attempts: Attempt[]): string | null {
  // Counted by step name, so this works for any call flow.
  const misses = new Map<string, number>()
  for (const a of attempts) {
    for (const step of a.scorecard.steps) {
      if (step.status === 'missed' || step.status === 'out_of_order') {
        misses.set(step.label, (misses.get(step.label) ?? 0) + 1)
      }
    }
  }
  let top: [string, number] | null = null
  for (const entry of misses) if (!top || entry[1] > top[1]) top = entry
  if (!top) return null
  return `${top[0]} (${top[1]}×)`
}

export default function AttemptTables({ attempts, onOpen, showAgents = false, customScenarios = [] }: Props) {
  const agents = [...new Set(attempts.map((a) => a.agentName))].sort()

  const byAgent = agents.map((name) => {
    const runs = attempts.filter((a) => a.agentName === name)
    return {
      name,
      runs: runs.length,
      avg: average(runs.map((a) => a.scorecard.overall_score)),
      passes: runs.filter((a) => a.scorecard.result === 'pass').length,
      violations: runs.filter((a) => a.scorecard.compliance.some((c) => c.status === 'violation')).length,
      missed: mostMissedStep(runs),
      last: runs.reduce((latest, a) => (a.startedAt > latest ? a.startedAt : latest), runs[0].startedAt),
    }
  })

  // Built-in and trainer-built scenarios, plus any other scenario ids that appear in the calls.
  const scenarioRows = new Map<string, string>()
  for (const s of [...SCENARIOS, ...customScenarios]) scenarioRows.set(s.id, s.title)
  for (const a of attempts) if (!scenarioRows.has(a.scenarioId)) scenarioRows.set(a.scenarioId, attemptTitle(a))

  const byScenario = [...scenarioRows].map(([id, title]) => {
    const runs = attempts.filter((a) => a.scenarioId === id)
    return {
      id,
      title,
      runs: runs.length,
      avg: average(runs.map((a) => a.scorecard.overall_score)),
      passes: runs.filter((a) => a.scorecard.result === 'pass').length,
    }
  })

  return (
    <>
      {showAgents && (
        <div className="table-wrap card">
          <table>
            <caption>By agent</caption>
            <thead>
              <tr>
                <th scope="col">Agent</th>
                <th scope="col" className="num">Calls</th>
                <th scope="col" className="num">Avg score</th>
                <th scope="col" className="num">Passed</th>
                <th scope="col" className="num">Compliance issues</th>
                <th scope="col">Most-missed step</th>
                <th scope="col">Last practiced</th>
              </tr>
            </thead>
            <tbody>
              {byAgent.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td className="num">{row.runs}</td>
                  <td className="num">{row.avg ?? '–'}</td>
                  <td className="num">
                    {row.passes} / {row.runs}
                  </td>
                  <td className="num">{row.violations > 0 ? `⚠ ${row.violations}` : '0'}</td>
                  <td>{row.missed ?? '–'}</td>
                  <td>{new Date(row.last).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="table-wrap card">
        <table>
          <caption>By scenario</caption>
          <thead>
            <tr>
              <th scope="col">Scenario</th>
              <th scope="col" className="num">Calls</th>
              <th scope="col" className="num">Avg score</th>
              <th scope="col" className="num">Passed</th>
            </tr>
          </thead>
          <tbody>
            {byScenario.map((row) => (
              <tr key={row.id}>
                <td>{row.title}</td>
                <td className="num">{row.runs}</td>
                <td className="num">{row.avg ?? '–'}</td>
                <td className="num">{row.runs ? `${row.passes} / ${row.runs}` : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-wrap card">
        <table>
          <caption>All calls</caption>
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Agent</th>
              <th scope="col">Scenario</th>
              <th scope="col" className="num">Score</th>
              <th scope="col">Result</th>
              <th scope="col">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {attempts.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.startedAt).toLocaleString()}</td>
                <td>{a.agentName}</td>
                <td>{attemptTitle(a)}</td>
                <td className="num">{Math.round(a.scorecard.overall_score)}</td>
                <td>
                  <span className={`status status-${a.scorecard.result}`}>{RESULT_LABEL[a.scorecard.result]}</span>
                </td>
                <td>
                  <button className="link" onClick={() => onOpen(a)}>
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
