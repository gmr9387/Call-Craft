import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Me } from '../shared/accounts.ts'
import type { ClassInfo, JoinResult } from '../shared/classes.ts'
import { getScenario, type Scenario } from '../shared/scenarios.ts'
import { authStatus, logout, myClass, SIGNED_OUT_EVENT } from './api.ts'
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
import PeopleView from './components/PeopleView.tsx'
import AccountView from './components/AccountView.tsx'

type View =
  | { name: 'dashboard' }
  | { name: 'home' }
  | { name: 'mycalls' }
  | { name: 'account' }
  | { name: 'people' }
  | { name: 'call'; scenario: Scenario; run: number; preview?: ClassInfo }
  | {
      name: 'score'
      attempt: Attempt
      saveNote?: SaveNote
      from: 'call' | 'preview' | 'trainer' | 'mycalls'
      scenario?: Scenario
      preview?: ClassInfo
      // The class a trainer opened this call from.
      classId?: string | null
    }
  | { name: 'trainer'; classId: string | null; section: TrainerSection }
  | { name: 'builder'; classInfo: ClassInfo; scenario: Scenario | null }

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
  const [view, setView] = useState<View>({ name: 'dashboard' })
  const [classScenarios, setClassScenarios] = useState<Scenario[]>([])
  const isDesktop = useIsDesktop()

  useEffect(() => {
    authStatus().then(
      ({ user, needsSetup }) => {
        setSession({ state: 'ready', user, needsSetup })
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
    setView(homeView(me))
    window.scrollTo(0, 0)
  }

  const signOut = () => {
    void logout().catch(() => undefined)
    setSession({ state: 'ready', user: null, needsSetup: false })
    setAuthMode(null)
    setClassScenarios([])
    window.scrollTo(0, 0)
  }

  if (!user) {
    const mode = authMode ?? (session.needsSetup ? { kind: 'setup' as const } : null)
    if (!mode) return <Marketing onSignIn={() => setAuthMode({ kind: 'login' })} />
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
    setSession({ state: 'ready', user: { ...user, classInfo: result.classInfo }, needsSetup: false })
  }

  const startCall = (scenario: Scenario, preview?: ClassInfo) =>
    setView({ name: 'call', scenario, run: Date.now(), preview })

  const toTrainer = (classId: string | null = null, section: TrainerSection = 'results') =>
    setView({ name: 'trainer', classId, section })

  const section =
    view.name === 'dashboard' ||
    view.name === 'account' ||
    view.name === 'people' ||
    view.name === 'mycalls'
      ? view.name
      : view.name === 'home' || view.name === 'call'
        ? view.name === 'call' && view.preview
          ? 'trainer'
          : 'practice'
        : view.name === 'score' && view.from === 'mycalls'
          ? 'mycalls'
          : view.name === 'score' && view.from === 'call'
            ? 'practice'
            : 'trainer'

  const NAV = [
    ...(user.role === 'agent'
      ? [{ id: 'dashboard', label: 'Dashboard', icon: '⌂', go: () => setView({ name: 'dashboard' }) }]
      : [{ id: 'trainer', label: 'Classes', icon: '✎', go: () => toTrainer() }]),
    { id: 'practice', label: 'Practice', icon: '☎', go: () => setView({ name: 'home' }) },
    { id: 'mycalls', label: 'My calls', icon: '☰', go: () => setView({ name: 'mycalls' }) },
    ...(user.role === 'admin' ? [{ id: 'people', label: 'People', icon: '☺', go: () => setView({ name: 'people' }) }] : []),
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
        {view.name === 'dashboard' && (
          <Dashboard
            user={user}
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
            classScenarios={user.role === 'agent' ? classScenarios : []}
            onStart={(scenario) => startCall(scenario)}
          />
        )}
        {view.name === 'mycalls' && <MyCalls onOpen={(attempt) => setView({ name: 'score', attempt, from: 'mycalls' })} />}
        {view.name === 'account' && <AccountView user={user} />}
        {view.name === 'people' && user.role === 'admin' && <PeopleView user={user} />}
        {view.name === 'call' && (
          <CallScreen
            key={view.run}
            scenario={view.scenario}
            agentName={user.name}
            preview={!!view.preview}
            onScored={(attempt, saveNote) =>
              setView({
                name: 'score',
                attempt,
                saveNote,
                from: view.preview ? 'preview' : 'call',
                scenario: view.scenario,
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
            backLabel={
              view.from === 'call' ? 'Pick another call' : view.from === 'mycalls' ? 'Back to my calls' : 'Back to class'
            }
            onRetry={
              view.from === 'trainer' || view.from === 'mycalls'
                ? undefined
                : () => {
                    const scenario = view.scenario ?? getScenario(view.attempt.scenarioId)
                    if (scenario) startCall(scenario, view.preview)
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
            onOpen={(attempt) => setView({ name: 'score', attempt, from: 'trainer', classId: view.classId })}
            onBuild={(classInfo, scenario) => setView({ name: 'builder', classInfo, scenario })}
            onTry={(scenario, classInfo) => startCall(scenario, classInfo)}
          />
        )}
        {view.name === 'builder' && (
          <ScenarioBuilder
            classInfo={view.classInfo}
            scenario={view.scenario}
            onSaved={(scenario, tryIt) =>
              tryIt ? startCall(scenario, view.classInfo) : toTrainer(view.classInfo.id, 'scenarios')
            }
            onCancel={() => toTrainer(view.classInfo.id, 'scenarios')}
          />
        )}
      </main>
    </div>
  )
}
