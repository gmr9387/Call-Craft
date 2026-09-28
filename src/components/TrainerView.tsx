import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Me, Person } from '../../shared/accounts.ts'
import type { ClassAgent, ClassDashboard, ClassInfo, ClassSummary } from '../../shared/classes.ts'
import { BUILTIN_FLOW_ID, type CallFlow, type FlowSummary } from '../../shared/flows.ts'
import type { Scenario } from '../../shared/scenarios.ts'
import {
  archiveScenario,
  createClass,
  listClasses,
  listFlows,
  listPeople,
  loadDashboard,
  moveAgent,
  reassignClass,
  removeAgent,
  resetLink,
  shareLink,
  updateClass,
} from '../api.ts'
import { downloadResults, downloadRoster } from '../csv.ts'
import type { Attempt } from '../history.ts'
import AttemptTables from './AttemptTables.tsx'
import CallerAvatar from './CallerAvatar.tsx'
import { CopyButton, LinkNotice } from './CopyLink.tsx'
import EditPerson from './EditPerson.tsx'

export type TrainerSection = 'results' | 'agents' | 'scenarios' | 'settings'

interface Props {
  user: Me
  classId: string | null
  section: TrainerSection
  onSelect: (classId: string | null, section?: TrainerSection) => void
  onOpen: (attempt: Attempt) => void
  onBuild: (classInfo: ClassInfo, scenario: Scenario | null, flow: CallFlow) => void
  onTry: (scenario: Scenario, classInfo: ClassInfo, flow: CallFlow) => void
  onFlows: () => void
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '–')
const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

// Call flows a class can use (archived ones are left out).
function useFlows(): FlowSummary[] | null {
  const [flows, setFlows] = useState<FlowSummary[] | null>(null)
  useEffect(() => {
    let cancelled = false
    listFlows().then(
      (list) => !cancelled && setFlows(list.filter((f) => !f.archived)),
      () => !cancelled && setFlows([]),
    )
    return () => {
      cancelled = true
    }
  }, [])
  return flows
}

function FlowSelect({
  flows,
  value,
  onChange,
  id,
}: {
  flows: FlowSummary[] | null
  value: string
  onChange: (id: string) => void
  id?: string
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={!flows}>
      {(flows ?? []).map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
      {!flows && <option value={value}>Loading…</option>}
    </select>
  )
}

// ---- All classes ----

function ClassList({ user, onSelect, onFlows }: Pick<Props, 'user' | 'onSelect' | 'onFlows'>) {
  const [classes, setClasses] = useState<ClassSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [flowId, setFlowId] = useState(BUILTIN_FLOW_ID)
  const [busy, setBusy] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const flows = useFlows()
  const isAdmin = user.role === 'admin'

  useEffect(() => {
    let cancelled = false
    listClasses().then(
      (list) => !cancelled && setClasses(list),
      (err) => !cancelled && setError(message(err, 'Could not load classes.')),
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
      const created = await createClass(name, flowId)
      onSelect(created.id, 'agents')
    } catch (err) {
      setError(message(err, 'Could not create the class.'))
      setBusy(false)
    }
  }

  const archivedCount = classes?.filter((c) => c.archived).length ?? 0
  const shown = classes?.filter((c) => showArchived || !c.archived) ?? []

  return (
    <>
      {classes && classes.length === 0 && (
        <section className="card getting-started">
          <h2>Getting started</h2>
          <p className="muted">Four steps to your first class. Most trainers are done in 10 minutes.</p>
          <ol>
            <li>
              <strong>Pick a call flow.</strong> The steps and rules your agents are scored on. Try the sample, or{' '}
              <button className="link" onClick={onFlows}>
                build your own
              </button>
              .
            </li>
            <li>
              <strong>Create a class</strong> below and choose that call flow.
            </li>
            <li>
              <strong>Send agents the sign-up link.</strong> They make an account and land in your class.
            </li>
            <li>
              <strong>Add practice calls</strong> on the class's Scenarios tab. Describe a caller in one sentence and
              CallCraft writes it.
            </li>
          </ol>
        </section>
      )}
      <form className="card create-class" onSubmit={create}>
        <div>
          <h2>Start a new class</h2>
          <p className="muted small">For example, one certification class. Agents join it with a code.</p>
        </div>
        <div className="create-class-fields">
          <label className="field">
            <span>Class name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. October certification, group B"
              maxLength={120}
            />
          </label>
          <label className="field">
            <span>
              Call flow{' '}
              <button type="button" className="link small" onClick={onFlows}>
                (manage)
              </button>
            </span>
            <FlowSelect flows={flows} value={flowId} onChange={setFlowId} />
          </label>
        </div>
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
        ) : shown.length === 0 ? (
          <p className="muted">No classes yet. Create one above, then share its code with your agents.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Code</th>
                  <th>Call flow</th>
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
                {shown.map((c) => (
                  <tr key={c.id} className={c.archived ? 'is-off' : ''}>
                    <td>
                      <strong>{c.name}</strong>
                      {c.archived && <span className="muted small"> · archived</span>}
                    </td>
                    <td>
                      <code>{c.classCode}</code>
                    </td>
                    <td>{c.flowName}</td>
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
        {archivedCount > 0 && (
          <div className="actions-right">
            <button className="link muted-link" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? 'Hide archived classes' : `Show archived classes (${archivedCount})`}
            </button>
          </div>
        )}
      </section>
    </>
  )
}

// ---- One class ----

function ClassPanel({
  user,
  classId,
  section,
  onSelect,
  onOpen,
  onBuild,
  onTry,
  onFlows,
}: Props & { classId: string }) {
  const [dashboard, setDashboard] = useState<ClassDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setDashboard(await loadDashboard(classId))
    } catch (err) {
      setError(message(err, 'Could not load the class.'))
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
        setError(message(err, 'Could not load the class.'))
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

  const { classInfo, agents, scenarios, flow } = dashboard
  const signupLink = shareLink('join', classInfo.classCode)
  const setSection = (s: TrainerSection) => onSelect(classId, s)

  return (
    <>
      {back}
      {dashboard.archived && (
        <p className="error" role="status">
          This class is archived. Its code no longer works for new agents. You can bring it back under Settings.
        </p>
      )}
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
            Call flow: <strong>{flow.name}</strong> · New agents open the sign-up link (or click "Create your account"
            and type the code).
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
        <button role="tab" aria-selected={section === 'settings'} onClick={() => setSection('settings')}>
          Settings
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
          onBuild={(scenario) => onBuild(classInfo, scenario, flow)}
          onTry={(scenario) => onTry(scenario, classInfo, flow)}
        />
      )}
      {section === 'settings' && (
        <SettingsPanel user={user} dashboard={dashboard} onChanged={() => void refresh()} onFlows={onFlows} />
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
      <div className="section-head">
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
        <button className="secondary" onClick={() => downloadResults(dashboard)}>
          ⬇ Download results (spreadsheet)
        </button>
      </div>
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
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reset, setReset] = useState<{ name: string; link: string } | null>(null)
  const [otherClasses, setOtherClasses] = useState<ClassSummary[]>([])
  const { agents, attempts, classInfo } = dashboard

  // Other active classes this trainer runs, for "Move to".
  useEffect(() => {
    let cancelled = false
    listClasses().then(
      (list) => !cancelled && setOtherClasses(list.filter((c) => c.id !== classInfo.id && !c.archived)),
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [classInfo.id])

  const run = async (id: string, action: () => Promise<void>, fallback: string) => {
    setBusyId(id)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(message(err, fallback))
    } finally {
      setBusyId(null)
    }
  }

  const makeReset = (a: ClassAgent) =>
    run(a.id, async () => setReset({ name: a.name, link: await resetLink(a.id) }), 'Could not make a reset link.')

  const remove = (a: ClassAgent) => {
    if (!confirm(`Remove ${a.name} from ${classInfo.name}? Their past calls stay in the results.`)) return
    void run(
      a.id,
      async () => {
        await removeAgent(classInfo.id, a.id)
        onChanged()
      },
      'Could not remove the agent.',
    )
  }

  const move = (a: ClassAgent, toId: string) => {
    const to = otherClasses.find((c) => c.id === toId)
    if (!to || !confirm(`Move ${a.name} to ${to.name}? Their past calls stay in this class's results.`)) return
    void run(
      a.id,
      async () => {
        await moveAgent(classInfo.id, a.id, to.id)
        onChanged()
      },
      'Could not move the agent.',
    )
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
          <div className="section-head">
            <h2>Agents</h2>
            <button className="secondary" onClick={() => downloadRoster(dashboard)}>
              ⬇ Download list (spreadsheet)
            </button>
          </div>
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
                  if (editing === a.id) {
                    return (
                      <tr key={a.id}>
                        <td colSpan={6}>
                          <EditPerson
                            person={a}
                            onDone={(changed) => {
                              setEditing(null)
                              if (changed) onChanged()
                            }}
                          />
                        </td>
                      </tr>
                    )
                  }
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
                          <button className="link" disabled={busyId === a.id} onClick={() => setEditing(a.id)}>
                            Edit
                          </button>
                          <button
                            className="secondary small-button"
                            disabled={busyId === a.id}
                            onClick={() => void makeReset(a)}
                          >
                            Reset password
                          </button>
                          {otherClasses.length > 0 && (
                            <select
                              className="small-select"
                              value=""
                              disabled={busyId === a.id}
                              onChange={(e) => move(a, e.target.value)}
                              aria-label={`Move ${a.name} to another class`}
                            >
                              <option value="">Move to…</option>
                              {otherClasses.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          )}
                          <button className="link muted-link" disabled={busyId === a.id} onClick={() => remove(a)}>
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
      setError(message(e, 'Could not update the scenario.'))
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
            Practice calls for {dashboard.classInfo.name}, on the <strong>{dashboard.flow.name}</strong> call flow.
            {dashboard.flow.builtIn && ' Agents also see the built-in sample calls.'}
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
        <p className="card empty">
          No scenarios yet. Click "+ New scenario" to make your first one.
          {!dashboard.flow.builtIn && ' Agents in this class have nothing to practice until you do.'}
        </p>
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

function SettingsPanel({
  user,
  dashboard,
  onChanged,
  onFlows,
}: {
  user: Me
  dashboard: ClassDashboard
  onChanged: () => void
  onFlows: () => void
}) {
  const { classInfo } = dashboard
  const [name, setName] = useState(classInfo.name)
  const [flowId, setFlowId] = useState(dashboard.flow.id)
  const [trainerId, setTrainerId] = useState(dashboard.trainerId ?? '')
  const [staff, setStaff] = useState<Person[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const flows = useFlows()
  const isAdmin = user.role === 'admin'

  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    listPeople().then(
      (people) => !cancelled && setStaff(people.filter((p) => p.role !== 'agent' && !p.disabled)),
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [isAdmin])

  const run = async (key: string, action: () => Promise<unknown>, done: string) => {
    setBusy(key)
    setError(null)
    setNotice(null)
    try {
      await action()
      setNotice(done)
      onChanged()
    } catch (err) {
      setError(message(err, 'That did not work. Try again.'))
    } finally {
      setBusy(null)
    }
  }

  const flowChanged = flowId !== dashboard.flow.id
  const hasScenarios = dashboard.scenarios.length > 0

  return (
    <div className="settings-grid">
      {notice && (
        <p className="notice wide" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="error wide" role="alert">
          {error}
        </p>
      )}

      <form
        className="card setup-card"
        onSubmit={(e) => {
          e.preventDefault()
          void run('name', () => updateClass(classInfo.id, { name }), 'Class renamed.')
        }}
      >
        <h2>Class name</h2>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} aria-label="Class name" />
        <button className="secondary" type="submit" disabled={!name.trim() || name === classInfo.name || busy === 'name'}>
          Rename
        </button>
      </form>

      <div className="card setup-card">
        <h2>Call flow</h2>
        <p className="muted small">
          The steps and rules agents in this class are scored on.{' '}
          <button type="button" className="link small" onClick={onFlows}>
            Manage call flows
          </button>
        </p>
        <FlowSelect flows={flows} value={flowId} onChange={setFlowId} />
        {flowChanged && hasScenarios && (
          <p className="small warn-text">
            Your scenarios were written for the current call flow. Check them after switching.
          </p>
        )}
        <button
          className="secondary"
          disabled={!flowChanged || busy === 'flow'}
          onClick={() => void run('flow', () => updateClass(classInfo.id, { flowId }), 'Call flow changed.')}
        >
          Use this call flow
        </button>
      </div>

      {isAdmin && (
        <div className="card setup-card">
          <h2>Trainer</h2>
          <p className="muted small">Hand this class to another trainer. They'll see it under their classes.</p>
          <select value={trainerId} onChange={(e) => setTrainerId(e.target.value)} disabled={!staff} aria-label="Trainer">
            {!dashboard.trainerId && <option value="">No trainer</option>}
            {(staff ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.role === 'admin' ? 'Admin' : 'Trainer'})
              </option>
            ))}
          </select>
          <button
            className="secondary"
            disabled={!trainerId || trainerId === dashboard.trainerId || busy === 'trainer'}
            onClick={() => void run('trainer', () => reassignClass(classInfo.id, trainerId), 'Trainer changed.')}
          >
            Hand over class
          </button>
        </div>
      )}

      <div className="card setup-card">
        <h2>{dashboard.archived ? 'Bring back this class' : 'Archive this class'}</h2>
        <p className="muted small">
          {dashboard.archived
            ? 'Its code works again for new agents, and it shows in your class list.'
            : 'For classes that have finished. The code stops working for new agents. Results are kept, and you can bring it back any time.'}
        </p>
        <button
          className={dashboard.archived ? 'secondary' : 'danger'}
          disabled={busy === 'archive'}
          onClick={() => {
            if (!dashboard.archived && !confirm(`Archive ${classInfo.name}?`)) return
            void run(
              'archive',
              () => updateClass(classInfo.id, { archived: !dashboard.archived }),
              dashboard.archived ? 'Class brought back.' : 'Class archived.',
            )
          }}
        >
          {dashboard.archived ? 'Bring back' : 'Archive class'}
        </button>
      </div>
    </div>
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
        <ClassList user={props.user} onSelect={props.onSelect} onFlows={props.onFlows} />
      )}
    </div>
  )
}
