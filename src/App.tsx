import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ClassInfo, JoinResult } from '../shared/classes.ts'
import { getScenario, type Scenario } from '../shared/scenarios.ts'
import { joinClass } from './api.ts'
import type { Attempt } from './history.ts'
import {
  loadAgentName,
  loadAttempts,
  loadJoinedClass,
  loadSignedIn,
  saveAgentName,
  saveJoinedClass,
  saveSignedIn,
} from './history.ts'
import Home from './components/Home.tsx'
import CallScreen, { type SaveNote } from './components/CallScreen.tsx'
import ScorecardView from './components/ScorecardView.tsx'
import TrainerView, { type TrainerSection } from './components/TrainerView.tsx'
import ScenarioBuilder from './components/ScenarioBuilder.tsx'
import Marketing from './components/Marketing.tsx'
import Dashboard from './components/Dashboard.tsx'
import MyCalls from './components/MyCalls.tsx'

type View =
  | { name: 'dashboard' }
  | { name: 'home' }
  | { name: 'mycalls' }
  | { name: 'call'; scenario: Scenario; run: number; preview?: ClassInfo }
  | {
      name: 'score'
      attempt: Attempt
      saveNote?: SaveNote
      from: 'call' | 'preview' | 'trainer' | 'mycalls'
      scenario?: Scenario
      preview?: ClassInfo
    }
  | { name: 'trainer'; section: TrainerSection }
  | { name: 'builder'; trainerKey: string; classInfo: ClassInfo; scenario: Scenario | null }

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
          Back to the home page
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const [signedIn, setSignedIn] = useState(loadSignedIn)
  const [view, setView] = useState<View>({ name: 'dashboard' })
  const [agentName, setAgentName] = useState(loadAgentName)
  const [joinedClass, setJoinedClass] = useState<ClassInfo | null>(loadJoinedClass)
  const [classScenarios, setClassScenarios] = useState<Scenario[]>([])
  const isDesktop = useIsDesktop()

  // Refresh the class's scenarios on the practice page, in case the trainer added or changed some.
  const classCode = joinedClass?.classCode
  const onHome = view.name === 'home' || view.name === 'dashboard'
  useEffect(() => {
    if (!signedIn || !classCode || !onHome) return
    let cancelled = false
    joinClass(classCode).then(
      (result) => {
        if (!cancelled) setClassScenarios(result.scenarios)
      },
      () => undefined, // Keep practicing with the built-in scenarios if the class can't be reached.
    )
    return () => {
      cancelled = true
    }
  }, [signedIn, classCode, onHome])

  const updateName = (name: string) => {
    setAgentName(name)
    saveAgentName(name)
  }

  const join = (result: JoinResult) => {
    setJoinedClass(result.classInfo)
    setClassScenarios(result.scenarios)
    saveJoinedClass(result.classInfo)
  }

  const leave = () => {
    setJoinedClass(null)
    setClassScenarios([])
    saveJoinedClass(null)
  }

  // Development only: "Sign in" lets anyone in without an account.
  const signIn = () => {
    saveSignedIn(true)
    setSignedIn(true)
    setView({ name: 'dashboard' })
    window.scrollTo(0, 0)
  }

  const signOut = () => {
    saveSignedIn(false)
    setSignedIn(false)
    window.scrollTo(0, 0)
  }

  if (!signedIn) return <Marketing onSignIn={signIn} />
  if (!isDesktop) return <DesktopOnly onSignOut={signOut} />

  const startCall = (scenario: Scenario, preview?: ClassInfo) =>
    setView({ name: 'call', scenario, run: Date.now(), preview })

  const section =
    view.name === 'dashboard'
      ? 'dashboard'
      : view.name === 'home' || view.name === 'call'
        ? 'practice'
        : view.name === 'mycalls' || (view.name === 'score' && view.from === 'mycalls')
          ? 'mycalls'
          : view.name === 'score' && view.from === 'call'
            ? 'practice'
            : 'trainer'

  const NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: '⌂', go: () => setView({ name: 'dashboard' }) },
    { id: 'practice', label: 'Practice', icon: '☎', go: () => setView({ name: 'home' }) },
    { id: 'mycalls', label: 'My calls', icon: '☰', go: () => setView({ name: 'mycalls' }) },
    { id: 'trainer', label: 'Trainer', icon: '✎', go: () => setView({ name: 'trainer', section: 'results' }) },
  ] as const

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView({ name: 'dashboard' })}>
          <span className="brand-mark" aria-hidden>◉</span> CallCraft
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
          {agentName.trim() && <p className="small muted">Signed in as {agentName.trim()}</p>}
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
            agentName={agentName}
            onNameChange={updateName}
            classInfo={joinedClass}
            classScenarios={classScenarios}
            attempts={loadAttempts()}
            onJoin={join}
            onLeave={leave}
            onStart={(scenario) => startCall(scenario)}
            onPractice={() => setView({ name: 'home' })}
            onMyCalls={() => setView({ name: 'mycalls' })}
            onOpen={(attempt) => setView({ name: 'score', attempt, from: 'mycalls' })}
          />
        )}
        {view.name === 'home' && (
          <Home
            agentName={agentName}
            onNameChange={updateName}
            classInfo={joinedClass}
            classScenarios={classScenarios}
            onStart={(scenario) => startCall(scenario)}
          />
        )}
        {view.name === 'mycalls' && <MyCalls onOpen={(attempt) => setView({ name: 'score', attempt, from: 'mycalls' })} />}
        {view.name === 'call' && (
          <CallScreen
            key={view.run}
            scenario={view.scenario}
            agentName={view.preview ? 'Trainer preview' : agentName}
            classInfo={view.preview ?? joinedClass}
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
            onCancel={() => setView(view.preview ? { name: 'trainer', section: 'scenarios' } : { name: 'home' })}
          />
        )}
        {view.name === 'score' && (
          <ScorecardView
            attempt={view.attempt}
            saveNote={view.saveNote}
            backLabel={
              view.from === 'call' ? 'Pick another call' : view.from === 'mycalls' ? 'Back to my calls' : 'Back to trainer'
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
              setView(
                view.from === 'call'
                  ? { name: 'home' }
                  : view.from === 'mycalls'
                    ? { name: 'mycalls' }
                    : { name: 'trainer', section: view.from === 'preview' ? 'scenarios' : 'results' },
              )
            }
          />
        )}
        {view.name === 'trainer' && (
          <TrainerView
            initialSection={view.section}
            onOpen={(attempt) => setView({ name: 'score', attempt, from: 'trainer' })}
            onBuild={(trainerKey, classInfo, scenario) => setView({ name: 'builder', trainerKey, classInfo, scenario })}
            onTry={(scenario, classInfo) => startCall(scenario, classInfo)}
          />
        )}
        {view.name === 'builder' && (
          <ScenarioBuilder
            trainerKey={view.trainerKey}
            classInfo={view.classInfo}
            scenario={view.scenario}
            onSaved={(scenario, tryIt) =>
              tryIt ? startCall(scenario, view.classInfo) : setView({ name: 'trainer', section: 'scenarios' })
            }
            onCancel={() => setView({ name: 'trainer', section: 'scenarios' })}
          />
        )}
      </main>
    </div>
  )
}
