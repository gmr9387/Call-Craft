import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Me } from '../../shared/accounts.ts'
import type { ClassDashboard, ClassInfo, ClassSummary } from '../../shared/classes.ts'
import type { Scenario } from '../../shared/scenarios.ts'
import { archiveScenario, createClass, listClasses, loadDashboard, removeAgent, resetLink, shareLink } from '../api.ts'
import type { Attempt } from '../history.ts'
import AttemptTables from './AttemptTables.tsx'
import CallerAvatar from './CallerAvatar.tsx'
import { CopyButton, LinkNotice } from './CopyLink.tsx'

export type TrainerSection = 'results' | 'agents' | 'scenarios'

interface Props {
  user: Me
  classId: string | null
  section: TrainerSection
  onSelect: (classId: string | null, section?: TrainerSection) => void
  onOpen: (attempt: Attempt) => void
  onBuild: (classInfo: ClassInfo, scenario: Scenario | null) => void
  onTry: (scenario: Scenario, classInfo: ClassInfo) => void
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '–')

// ---- All classes ----

function ClassList({ user, onSelect }: Pick<Props, 'user' | 'onSelect'>) {
  const [classes, setClasses] = useState<ClassSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const isAdmin = user.role === 'admin'

  useEffect(() => {
    let cancelled = false
    listClasses().then(
      (list) => !cancelled && setClasses(list),
      (err) => !cancelled && setError(err instanceof Error ? err.message : 'Could not load classes.'),
    )
    return () => {
      cancelled = true
    }
  }, [])

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const created = await createClass(name)
      onSelect(created.id, 'agents')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the class.')
      setBusy(false)
    }
  }

  return (
    <>
      <form className="card create-class" onSubmit={create}>
        <div>
          <h2>Start a new class</h2>
          <p className="muted small">For example, one certification class. Agents join it with a code.</p>
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. October certification, group B"
          maxLength={120}
          aria-label="Class name"
        />
        <button className="primary" type="submit" disabled={!name.trim() || busy}>
          {busy ? 'Creating…' : 'Create class'}
        </button>
      </form>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section className="card">
        <h2>{isAdmin ? 'All classes' : 'Your classes'}</h2>
        {!classes ? (
          <p className="muted">Loading…</p>
        ) : classes.length === 0 ? (
          <p className="muted">No classes yet. Create one above, then share its code with your agents.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Code</th>
                  {isAdmin && <th>Trainer</th>}
                  <th className="num">Agents</th>
                  <th className="num">Calls</th>
                  <th>Last call</th>
                  <th>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {classes.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong>
                    </td>
                    <td>
                      <code>{c.classCode}</code>
                    </td>
                    {isAdmin && <td>{c.trainerName ?? '–'}</td>}
                    <td className="num">{c.agentCount}</td>
                    <td className="num">{c.callCount}</td>
                    <td>{when(c.lastCallAt)}</td>
                    <td>
                      <button className="secondary small-button" onClick={() => onSelect(c.id)}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

// ---- One class ----

function ClassPanel({ classId, section, onSelect, onOpen, onBuild, onTry }: Omit<Props, 'user'> & { classId: string }) {
  const [dashboard, setDashboard] = useState<ClassDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setDashboard(await loadDashboard(classId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the class.')
    } finally {
      setLoading(false)
    }
  }, [classId])

  useEffect(() => {
    let cancelled = false
    loadDashboard(classId).then(
      (data) => {
        if (cancelled) return
        setDashboard(data)
        setLoading(false)
      },
      (err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load the class.')
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [classId])

  const back = (
    <button className="link back-link" onClick={() => onSelect(null)}>
      ← All classes
    </button>
  )

  if (!dashboard) {
    return (
      <>
        {back}
        <div className="card">
          {loading ? (
            <p className="muted">Loading class…</p>
          ) : (
            <>
              <p className="error" role="alert">
                {error}
              </p>
              <button className="primary" onClick={() => void refresh()}>
                Try again
              </button>
            </>
          )}
        </div>
      </>
    )
  }

  const { classInfo, agents, scenarios } = dashboard
  const signupLink = shareLink('join', classInfo.classCode)
  const setSection = (s: TrainerSection) => onSelect(classId, s)

  return (
    <>
      {back}
      <div className="card class-summary">
        <div>
          <p className="eyebrow">Class</p>
          <h2>{classInfo.name}</h2>
          <div className="key-row">
            <span className="muted small">Class code:</span>
            <code className="class-code">{classInfo.classCode}</code>
            <CopyButton value={classInfo.classCode} />
            <CopyButton value={signupLink} label="Copy sign-up link" />
          </div>
          <p className="muted small">
            New agents open the sign-up link (or click "Create your account" and type the code).
          </p>
        </div>
        <button className="secondary" onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="tabs big-tabs" role="tablist">
        <button role="tab" aria-selected={section === 'results'} onClick={() => setSection('results')}>
          Results
        </button>
        <button role="tab" aria-selected={section === 'agents'} onClick={() => setSection('agents')}>
          Agents ({agents.length})
        </button>
        <button role="tab" aria-selected={section === 'scenarios'} onClick={() => setSection('scenarios')}>
          Scenarios ({scenarios.filter((s) => !s.archived).length})
        </button>
      </div>

      {section === 'results' && <ResultsPanel dashboard={dashboard} onOpen={onOpen} />}
      {section === 'agents' && (
        <AgentsPanel dashboard={dashboard} signupLink={signupLink} onChanged={() => void refresh()} />
      )}
      {section === 'scenarios' && (
        <ScenariosPanel
          dashboard={dashboard}
          onChanged={(updated) =>
            setDashboard({
              ...dashboard,
              scenarios: dashboard.scenarios.map((s) => (s.id === updated.id ? updated : s)),
            })
          }
          onBuild={(scenario) => onBuild(classInfo, scenario)}
          onTry={(scenario) => onTry(scenario, classInfo)}
        />
      )}
    </>
  )
}

function ResultsPanel({ dashboard, onOpen }: { dashboard: ClassDashboard; onOpen: (attempt: Attempt) => void }) {
  const [agent, setAgent] = useState('all')
  const { attempts, classInfo } = dashboard
  const agents = [...new Set(attempts.map((a) => a.agentName))].sort()
  const shown = agent === 'all' ? attempts : attempts.filter((a) => a.agentName === agent)

  if (attempts.length === 0) {
    return (
      <p className="card empty">
        No scored calls yet. Once agents in {classInfo.name} practice, their scores show up here.
      </p>
    )
  }
  return (
    <>
      <label className="agent-filter">
        <span className="small muted">Show</span>
        <select value={agent} onChange={(e) => setAgent(e.target.value)}>
          <option value="all">All agents ({agents.length})</option>
          {agents.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <AttemptTables attempts={shown} onOpen={onOpen} showAgents={agent === 'all'} customScenarios={dashboard.scenarios} />
    </>
  )
}

function AgentsPanel({
  dashboard,
  signupLink,
  onChanged,
}: {
  dashboard: ClassDashboard
  signupLink: string
  onChanged: () => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reset, setReset] = useState<{ name: string; link: string } | null>(null)
  const { agents, attempts, classInfo } = dashboard

  const makeReset = async (id: string, name: string) => {
    setBusyId(id)
    setError(null)
    try {
      setReset({ name, link: await resetLink(id) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not make a reset link.')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (id: string, name: string) => {
    if (!confirm(`Remove ${name} from ${classInfo.name}? Their past calls stay in the results.`)) return
    setBusyId(id)
    setError(null)
    try {
      await removeAgent(classInfo.id, id)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the agent.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      {reset && (
        <LinkNotice
          title={`Reset link for ${reset.name}`}
          text="Send this link to the agent. It lets them set a new password, works once, and expires in 7 days."
          link={reset.link}
          onClose={() => setReset(null)}
        />
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {agents.length === 0 ? (
        <div className="card empty-invite">
          <h2>No agents yet</h2>
          <p className="muted">Send agents this link. They make an account and land in {classInfo.name}.</p>
          <div className="key-row">
            <code>{signupLink}</code>
            <CopyButton value={signupLink} label="Copy link" />
          </div>
        </div>
      ) : (
        <section className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Email</th>
                  <th className="num">Calls</th>
                  <th className="num">Avg score</th>
                  <th>Last active</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => {
                  const calls = attempts.filter((c) => c.userId === a.id)
                  const avg = calls.length
                    ? Math.round(calls.reduce((n, c) => n + c.scorecard.overall_score, 0) / calls.length)
                    : null
                  return (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.name}</strong>
                        {a.disabled && <span className="muted small"> · turned off</span>}
                      </td>
                      <td>{a.email}</td>
                      <td className="num">{calls.length}</td>
                      <td className="num">{avg ?? '–'}</td>
                      <td>{when(a.lastSeenAt)}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="secondary small-button"
                            disabled={busyId === a.id}
                            onClick={() => void makeReset(a.id, a.name)}
                          >
                            Reset password
                          </button>
                          <button
                            className="link muted-link"
                            disabled={busyId === a.id}
                            onClick={() => void remove(a.id, a.name)}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}

function ScenariosPanel({
  dashboard,
  onChanged,
  onBuild,
  onTry,
}: {
  dashboard: ClassDashboard
  onChanged: (scenario: Scenario) => void
  onBuild: (scenario: Scenario | null) => void
  onTry: (scenario: Scenario) => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toggleHidden = async (scenario: Scenario) => {
    setBusyId(scenario.id)
    setError(null)
    try {
      onChanged(await archiveScenario(dashboard.classInfo.id, scenario.id, !scenario.archived))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the scenario.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <div className="card scenarios-intro">
        <div>
          <h2>Your scenarios</h2>
          <p className="muted">
            Make practice calls for your class. Agents in {dashboard.classInfo.name} see them next to the built-in
            ones.
          </p>
        </div>
        <button className="primary big" onClick={() => onBuild(null)}>
          + New scenario
        </button>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {dashboard.scenarios.length === 0 ? (
        <p className="card empty">No scenarios yet. Click "+ New scenario" to make your first one.</p>
      ) : (
        <div className="scenario-grid">
          {dashboard.scenarios.map((s) => {
            const runs = dashboard.attempts.filter((a) => a.scenarioId === s.id)
            const avg = runs.length
              ? Math.round(runs.reduce((n, a) => n + a.scorecard.overall_score, 0) / runs.length)
              : null
            return (
              <article key={s.id} className={`card scenario-card ${s.archived ? 'is-hidden' : ''}`}>
                <div className="scenario-head">
                  <h3>{s.title}</h3>
                  <span className={`pill difficulty-${s.difficulty.toLowerCase()}`}>{s.difficulty}</span>
                </div>
                <div className="caller">
                  <CallerAvatar name={s.leadName} size="sm" />
                  <span>{s.leadName}</span>
                </div>
                <p>{s.focus}</p>
                <p className="muted small">
                  {s.archived ? 'Hidden from agents · ' : ''}
                  {runs.length} {runs.length === 1 ? 'call' : 'calls'}
                  {avg !== null ? ` · average score ${avg}` : ''}
                </p>
                <div className="card-actions">
                  <button className="secondary" onClick={() => onBuild(s)}>
                    Edit
                  </button>
                  <button className="secondary" onClick={() => onTry(s)}>
                    Try it
                  </button>
                  <button className="link" onClick={() => void toggleHidden(s)} disabled={busyId === s.id}>
                    {s.archived ? 'Show to agents' : 'Hide from agents'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </>
  )
}

export default function TrainerView(props: Props) {
  return (
    <div className="history">
      <div className="page-head with-photo">
        <div>
          <h1>Classes</h1>
          <p className="muted">See how each class is doing, manage agents, and make practice calls for them.</p>
        </div>
        <img className="head-photo" src="/photos/agents-team.webp" alt="" width={800} height={1199} />
      </div>
      {props.classId ? (
        <ClassPanel key={props.classId} {...props} classId={props.classId} />
      ) : (
        <ClassList user={props.user} onSelect={props.onSelect} />
      )}
    </div>
  )
}
