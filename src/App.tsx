import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ClassInfo, JoinResult } from '../shared/classes.ts'
import { getScenario, type Scenario } from '../shared/scenarios.ts'
import { joinClass } from './api.ts'
import type { Attempt } from './history.ts'
import {
  loadAgentName,
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

type View =
  | { name: 'home' }
  | { name: 'call'; scenario: Scenario; run: number; preview?: ClassInfo }
  | {
      name: 'score'
      attempt: Attempt
      saveNote?: SaveNote
      from: 'call' | 'preview' | 'trainer'
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
  const [view, setView] = useState<View>({ name: 'home' })
  const [agentName, setAgentName] = useState(loadAgentName)
  const [joinedClass, setJoinedClass] = useState<ClassInfo | null>(loadJoinedClass)
  const [classScenarios, setClassScenarios] = useState<Scenario[]>([])
  const isDesktop = useIsDesktop()

  // Refresh the class's scenarios on the practice page, in case the trainer added or changed some.
  const classCode = joinedClass?.classCode
  const onHome = view.name === 'home'
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
    setView({ name: 'home' })
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

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setView({ name: 'home' })}>
          <span className="brand-mark" aria-hidden>◉</span> CallCraft
        </button>
        <nav>
          <button
            className={`link ${view.name === 'home' || view.name === 'call' ? 'active' : ''}`}
            onClick={() => setView({ name: 'home' })}
          >
            Practice
          </button>
          <button
            className={`link ${view.name === 'trainer' || view.name === 'builder' ? 'active' : ''}`}
            onClick={() => setView({ name: 'trainer', section: 'results' })}
          >
            Trainer
          </button>
          <button className="link muted-link" onClick={signOut}>
            Sign out
          </button>
        </nav>
      </header>

      <main>
        {view.name === 'home' && (
          <Home
            agentName={agentName}
            onNameChange={updateName}
            classInfo={joinedClass}
            classScenarios={classScenarios}
            onJoin={join}
            onLeave={leave}
            onStart={(scenario) => startCall(scenario)}
          />
        )}
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
            backLabel={view.from === 'call' ? 'Pick another call' : 'Back to trainer'}
            onRetry={
              view.from === 'trainer'
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
