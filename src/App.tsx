import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Me } from '../shared/accounts.ts'
import type { ClassInfo, JoinResult, Requirements } from '../shared/classes.ts'
import { getScenario, type Scenario } from '../shared/scenarios.ts'
import { BUILTIN_FLOW, type CallFlow } from '../shared/flows.ts'
import { authStatus, getCall, logout, myClass, SIGNED_OUT_EVENT } from './api.ts'
import type { Attempt } from './history.ts'
import Home from './components/Home.tsx'
import CallScreen, { type SaveNote } from './components/CallScreen.tsx'
import ScorecardView from './components/ScorecardView.tsx'
import TrainerView, { type TrainerSection } from './components/TrainerView.tsx'
import ScenarioBuilder from './components/ScenarioBuilder.tsx'
import Marketing from './components/Marketing.tsx'
import Dashboard from './components/Dashboard.tsx'
import MyCalls from './components/MyCalls.tsx'
import AuthScreen, { type AuthMode } from './components/AuthScreen.tsx'
import { clearActiveCall, loadActiveCall, type SavedCall } from './activeCall.ts'
import PeopleView from './components/PeopleView.tsx'
import AccountView from './components/AccountView.tsx'
import FlowsView, { FlowBuilder } from './components/FlowsView.tsx'
import SystemView from './components/SystemView.tsx'
import HelpView from './components/HelpView.tsx'
import PrivacyView from './components/PrivacyView.tsx'

type View =
  | { name: 'dashboard' }
  | { name: 'home' }
  | { name: 'mycalls' }
  | { name: 'account' }
  | { name: 'people' }
  | { name: 'system' }
  | { name: 'help' }
  | { name: 'privacy' }
  | { name: 'flows' }
  | { name: 'flow-builder'; flow: CallFlow | null; copy?: boolean }
  | { name: 'call'; scenario: Scenario; flow: CallFlow; run: number; preview?: ClassInfo; resume?: SavedCall }
  | {
      name: 'score'
      attempt: Attempt
      saveNote?: SaveNote
      from: 'call' | 'preview' | 'trainer' | 'mycalls'
      scenario?: Scenario
      flow?: CallFlow
      preview?: ClassInfo
      // The class a trainer opened this call from.
      classId?: string | null
    }
  | { name: 'trainer'; classId: string | null; section: TrainerSection }
  | { name: 'builder'; classInfo: ClassInfo; scenario: Scenario | null; flow: CallFlow }

// The app is made for desktop computers, the same as agents' real workstations.
const DESKTOP_QUERY = '(min-width: 900px)'

function subscribeToWidth(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribeToWidth, () => window.matchMedia(DESKTOP_QUERY).matches)
}

function DesktopOnly({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="desktop-only">
      <div className="card">
        <p className="desktop-icon" aria-hidden>
          🖥️
        </p>
        <h1>Please use a computer</h1>
        <p>CallCraft works on a desktop or laptop, just like the computer you'll take real calls on.</p>
        <p className="muted small">Already on a computer? Make the window wider.</p>
        <button className="link" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </div>
  )
}

// Links someone was sent: ?invite=…, ?reset=…, or ?join=CLASSCODE.
function modeFromUrl(): AuthMode | null {
  const params = new URLSearchParams(window.location.search)
  const invite = params.get('invite')
  const reset = params.get('reset')
  const join = params.get('join')
  if (invite) return { kind: 'invite', token: invite }
  if (reset) return { kind: 'reset', token: reset }
  if (join) return { kind: 'signup', classCode: join.toUpperCase() }
  return null
}

function clearUrl() {
  if (window.location.search) window.history.replaceState(null, '', window.location.pathname)
}

const homeView = (user: Me): View =>
  user.role === 'agent' ? { name: 'dashboard' } : { name: 'trainer', classId: null, section: 'results' }

type Session = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; user: Me | null; needsSetup: boolean }

export default function App() {
  const [session, setSession] = useState<Session>({ state: 'loading' })
  const [authMode, setAuthMode] = useState<AuthMode | null>(modeFromUrl)
  // Signed-out visitors can read the privacy page from the marketing page.
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [view, setView] = useState<View>({ name: 'dashboard' })
  const [classScenarios, setClassScenarios] = useState<Scenario[]>([])
  // The agent's class call flow (the built-in sample when not in a class).
  const [classFlow, setClassFlow] = useState<CallFlow>(BUILTIN_FLOW)
  const [progress, setProgress] = useState<{ requirements: Requirements; passed: string[] } | null>(null)
  const [aiProblem, setAiProblem] = useState<string | null>(null)
  const [usageWarning, setUsageWarning] = useState<string | null>(null)
  // Bumped to re-read the saved unfinished call after it's discarded.
  const [, setCallCheck] = useState(0)
  const isDesktop = useIsDesktop()

  useEffect(() => {
    authStatus().then(
      ({ user, needsSetup, aiProblem, usageWarning }) => {
        setSession({ state: 'ready', user, needsSetup })
        setAiProblem(aiProblem ?? null)
        setUsageWarning(usageWarning ?? null)
        if (user) {
          // Already signed in: a sign-up or invite link in the address bar doesn't apply.
          clearUrl()
          setAuthMode(null)
          setView(homeView(user))
        }
      },
      (err) => setSession({ state: 'error', message: err instanceof Error ? err.message : 'CallCraft could not load.' }),
    )
  }, [])

  // If the server ends the session (signed out elsewhere, account turned off), go back to sign-in.
  useEffect(() => {
    const onSignedOut = () => {
      setSession((s) => (s.state === 'ready' ? { ...s, user: null } : s))
      setAuthMode({ kind: 'login' })
    }
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut)
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut)
  }, [])

  const user = session.state === 'ready' ? session.user : null

  // Refresh the agent's class scenarios on the practice pages, in case the trainer changed some.
  const onHome = view.name === 'home' || view.name === 'dashboard'
  const isAgent = user?.role === 'agent'
  useEffect(() => {
    if (!isAgent || !onHome) return
    let cancelled = false
    myClass().then(
      (joined) => {
        if (cancelled) return
        setClassScenarios(joined?.scenarios ?? [])
        setClassFlow(joined?.flow ?? BUILTIN_FLOW)
        setProgress(joined ? { requirements: joined.requirements, passed: joined.passed } : null)
        setSession((s) =>
          s.state === 'ready' && s.user ? { ...s, user: { ...s.user, classInfo: joined?.classInfo ?? null } } : s,
        )
      },
      () => undefined, // Keep practicing with the built-in scenarios if the class can't be reached.
    )
    return () => {
      cancelled = true
    }
  }, [isAgent, onHome])

  // Trainers and admins: re-check for AI problems when they move between pages.
  const isStaff = !!user && user.role !== 'agent'
  useEffect(() => {
    if (!isStaff) return
    let cancelled = false
    authStatus().then(
      (s) => {
        if (cancelled) return
        setAiProblem(s.aiProblem ?? null)
        setUsageWarning(s.usageWarning ?? null)
      },
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [isStaff, view.name])

  if (session.state === 'loading') return <div className="app-loading" aria-busy="true" />
  if (session.state === 'error') {
    return (
      <div className="desktop-only">
        <div className="card">
          <h1>CallCraft can't load right now</h1>
          <p className="error">{session.message}</p>
          <button className="primary" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  const signedIn = (me: Me) => {
    clearUrl()
    setAuthMode(null)
    setSession({ state: 'ready', user: me, needsSetup: false })
    setClassFlow(BUILTIN_FLOW)
    setView(homeView(me))
    window.scrollTo(0, 0)
  }

  const signOut = () => {
    void logout().catch(() => undefined)
    setSession({ state: 'ready', user: null, needsSetup: false })
    setAuthMode(null)
    setClassScenarios([])
    setClassFlow(BUILTIN_FLOW)
    setProgress(null)
    setAiProblem(null)
    window.scrollTo(0, 0)
  }

  if (!user) {
    const mode = authMode ?? (session.needsSetup ? { kind: 'setup' as const } : null)
    if (showPrivacy) {
      return (
        <div className="public-page">
          <PrivacyView onBack={() => setShowPrivacy(false)} />
        </div>
      )
    }
    if (!mode) {
      return (
        <Marketing
          onSignIn={() => setAuthMode({ kind: 'login' })}
          onPrivacy={() => {
            setShowPrivacy(true)
            window.scrollTo(0, 0)
          }}
        />
      )
    }
    return (
      <AuthScreen
        mode={session.needsSetup && mode.kind === 'login' ? { kind: 'setup' } : mode}
        onMode={setAuthMode}
        onSignedIn={signedIn}
        onHome={() => {
          clearUrl()
          setAuthMode(null)
        }}
      />
    )
  }

  if (!isDesktop) return <DesktopOnly onSignOut={signOut} />

  const joined = (result: JoinResult) => {
    setClassScenarios(result.scenarios)
    setClassFlow(result.flow)
    setProgress({ requirements: result.requirements, passed: result.passed })
    setSession({ state: 'ready', user: { ...user, classInfo: result.classInfo }, needsSetup: false })
  }

  // Built-in sample calls use the sample flow; trainer-built ones use their class's flow.
  const startCall = (scenario: Scenario, preview?: ClassInfo, flow?: CallFlow) =>
    setView({
      name: 'call',
      scenario,
      flow: flow ?? (scenario.custom ? classFlow : BUILTIN_FLOW),
      run: Date.now(),
      preview,
    })

  const toTrainer = (classId: string | null = null, section: TrainerSection = 'results') =>
    setView({ name: 'trainer', classId, section })

  const section =
    view.name === 'dashboard' ||
    view.name === 'account' ||
    view.name === 'people' ||
    view.name === 'system' ||
    view.name === 'help' ||
    view.name === 'privacy' ||
    view.name === 'flows' ||
    view.name === 'mycalls'
      ? view.name
      : view.name === 'flow-builder'
        ? 'flows'
        : view.name === 'home' || view.name === 'call'
        ? view.name === 'call' && view.preview
          ? 'trainer'
          : 'practice'
        : view.name === 'score' && view.from === 'mycalls'
          ? 'mycalls'
          : view.name === 'score' && view.from === 'call'
            ? 'practice'
            : 'trainer'

  // A call left unfinished by a refresh, crash, or leaving the page mid-call.
  const unfinished = view.name === 'call' ? null : loadActiveCall(user.id)

  const NAV = [
    ...(user.role === 'agent'
      ? [{ id: 'dashboard', label: 'Dashboard', icon: '⌂', go: () => setView({ name: 'dashboard' }) }]
      : [
          { id: 'trainer', label: 'Classes', icon: '✎', go: () => toTrainer() },
          { id: 'flows', label: 'Call flows', icon: '⇢', go: () => setView({ name: 'flows' }) },
        ]),
    { id: 'practice', label: 'Practice', icon: '☎', go: () => setView({ name: 'home' }) },
    { id: 'mycalls', label: 'My calls', icon: '☰', go: () => setView({ name: 'mycalls' }) },
    ...(user.role === 'admin'
      ? [
          { id: 'people', label: 'People', icon: '☺', go: () => setView({ name: 'people' }) },
          { id: 'system', label: 'System', icon: '◷', go: () => setView({ name: 'system' }) },
        ]
      : []),
  ]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView(homeView(user))}>
          <span className="brand-mark" aria-hidden>
            ◉
          </span>{' '}
          CallCraft
        </button>
        <nav aria-label="Main">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`side-link ${section === item.id ? 'active' : ''}`}
              aria-current={section === item.id ? 'page' : undefined}
              onClick={item.go}
            >
              <span className="side-icon" aria-hidden>
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button className={`side-link ${section === 'help' ? 'active' : ''}`} onClick={() => setView({ name: 'help' })}>
            <span className="side-icon" aria-hidden>
              ?
            </span>
            Help
          </button>
          <button
            className={`side-link ${section === 'account' ? 'active' : ''}`}
            onClick={() => setView({ name: 'account' })}
          >
            <span className="side-icon" aria-hidden>
              ⚙
            </span>
            Account
          </button>
          <p className="small muted">
            {user.name}
            {user.role !== 'agent' && ` · ${user.role === 'admin' ? 'Admin' : 'Trainer'}`}
          </p>
          <button className="side-link" onClick={signOut}>
            <span className="side-icon" aria-hidden>
              ⏻
            </span>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main">
        {aiProblem && user.role !== 'agent' && (
          <div className="ai-banner" role="alert">
            <strong>⚠ Practice calls aren't working right now.</strong> {aiProblem}{' '}
            {user.role === 'admin' ? (
              <button className="link" onClick={() => setView({ name: 'system' })}>
                See System
              </button>
            ) : (
              'Let your admin know.'
            )}
          </div>
        )}
        {unfinished && (
          <div className="resume-banner" role="status">
            <span>
              <strong>You have an unfinished call</strong> with {unfinished.scenario.leadName} ({unfinished.scenario.title}
              ).
            </span>
            <button
              className="primary small-button"
              onClick={() =>
                setView({
                  name: 'call',
                  scenario: unfinished.scenario,
                  flow: unfinished.flow,
                  preview: unfinished.preview ?? undefined,
                  resume: unfinished,
                  run: Date.now(),
                })
              }
            >
              Go back to it
            </button>
            <button
              className="link muted-link"
              onClick={() => {
                clearActiveCall()
                setCallCheck((n) => n + 1)
              }}
            >
              Discard it
            </button>
          </div>
        )}
        {usageWarning && user.role !== 'agent' && (
          <div className="usage-banner" role="status">
            <strong>Heads up:</strong> {usageWarning}{' '}
            {user.role === 'admin' ? (
              <button className="link" onClick={() => setView({ name: 'system' })}>
                Change the limit
              </button>
            ) : (
              'An admin can raise the limit.'
            )}
          </div>
        )}
        {view.name === 'dashboard' && (
          <Dashboard
            user={user}
            flow={classFlow}
            progress={progress}
            classInfo={user.classInfo}
            classScenarios={classScenarios}
            onJoin={joined}
            onStart={(scenario) => startCall(scenario)}
            onPractice={() => setView({ name: 'home' })}
            onMyCalls={() => setView({ name: 'mycalls' })}
            onOpen={(attempt) => setView({ name: 'score', attempt, from: 'mycalls' })}
          />
        )}
        {view.name === 'home' && (
          <Home
            classInfo={user.classInfo}
            flow={user.role === 'agent' ? classFlow : BUILTIN_FLOW}
            classScenarios={user.role === 'agent' ? classScenarios : []}
            onStart={(scenario) => startCall(scenario)}
          />
        )}
        {view.name === 'mycalls' && <MyCalls onOpen={(attempt) => setView({ name: 'score', attempt, from: 'mycalls' })} />}
        {view.name === 'account' && <AccountView user={user} />}
        {view.name === 'people' && user.role === 'admin' && <PeopleView user={user} />}
        {view.name === 'system' && user.role === 'admin' && <SystemView />}
        {view.name === 'help' && <HelpView user={user} onPrivacy={() => setView({ name: 'privacy' })} />}
        {view.name === 'privacy' && <PrivacyView onBack={() => setView({ name: 'help' })} />}
        {view.name === 'flows' && user.role !== 'agent' && (
          <FlowsView onEdit={(flow, copy) => setView({ name: 'flow-builder', flow, copy })} />
        )}
        {view.name === 'flow-builder' && user.role !== 'agent' && (
          <FlowBuilder
            key={`${view.flow?.id ?? 'new'}-${view.copy ? 'copy' : 'edit'}`}
            flow={view.flow}
            copy={view.copy}
            onDone={() => setView({ name: 'flows' })}
          />
        )}
        {view.name === 'call' && (
          <CallScreen
            key={view.run}
            scenario={view.scenario}
            flow={view.flow}
            agentName={user.name}
            userId={user.id}
            preview={view.preview}
            resume={view.resume}
            onScored={(attempt, saveNote) =>
              setView({
                name: 'score',
                attempt,
                saveNote,
                from: view.preview ? 'preview' : 'call',
                scenario: view.scenario,
                flow: view.flow,
                preview: view.preview,
              })
            }
            onCancel={() => (view.preview ? toTrainer(view.preview.id, 'scenarios') : setView({ name: 'home' }))}
          />
        )}
        {view.name === 'score' && (
          <ScorecardView
            attempt={view.attempt}
            saveNote={view.saveNote}
            canReview={view.from === 'trainer'}
            onReviewed={(attempt) => setView({ ...view, attempt })}
            backLabel={
              view.from === 'call' ? 'Pick another call' : view.from === 'mycalls' ? 'Back to my calls' : 'Back to class'
            }
            onRetry={
              view.from === 'trainer' || view.from === 'mycalls'
                ? undefined
                : () => {
                    const scenario = view.scenario ?? getScenario(view.attempt.scenarioId)
                    if (scenario) startCall(scenario, view.preview, view.flow)
                    else setView({ name: 'home' })
                  }
            }
            onBack={() =>
              view.from === 'call'
                ? setView({ name: 'home' })
                : view.from === 'mycalls'
                  ? setView({ name: 'mycalls' })
                  : view.from === 'preview'
                    ? toTrainer(view.preview?.id ?? null, 'scenarios')
                    : toTrainer(view.classId ?? null, 'results')
            }
          />
        )}
        {view.name === 'trainer' && user.role !== 'agent' && (
          <TrainerView
            user={user}
            classId={view.classId}
            section={view.section}
            onSelect={(classId, next) => toTrainer(classId, next ?? 'results')}
            onOpen={(attempt) => {
              // Class lists leave out the conversation; load the whole call before showing it.
              const classId = view.classId
              const show = (full: Attempt) => setView({ name: 'score', attempt: full, from: 'trainer', classId })
              if (!attempt.partial) return show(attempt)
              getCall(attempt.id).then(show, (err) =>
                window.alert(err instanceof Error ? err.message : 'Could not open that call. Try again.'),
              )
            }}
            onBuild={(classInfo, scenario, flow) => setView({ name: 'builder', classInfo, scenario, flow })}
            onTry={(scenario, classInfo, flow) => startCall(scenario, classInfo, flow)}
            onFlows={() => setView({ name: 'flows' })}
          />
        )}
        {view.name === 'builder' && (
          <ScenarioBuilder
            flow={view.flow}
            scenario={view.scenario}
            onSaved={(scenario, tryIt) =>
              tryIt ? startCall(scenario, view.classInfo, view.flow) : toTrainer(view.classInfo.id, 'scenarios')
            }
            onCancel={() => toTrainer(view.classInfo.id, 'scenarios')}
          />
        )}
      </main>
    </div>
  )
}
