import { useState } from 'react'
import type { ClassInfo } from '../shared/classes.ts'
import { getScenario, type Scenario } from '../shared/scenarios.ts'
import type { Attempt } from './history.ts'
import { loadAgentName, loadJoinedClass, saveAgentName, saveJoinedClass } from './history.ts'
import Home from './components/Home.tsx'
import CallScreen, { type SaveNote } from './components/CallScreen.tsx'
import ScorecardView from './components/ScorecardView.tsx'
import TrainerView from './components/TrainerView.tsx'

type View =
  | { name: 'home' }
  | { name: 'call'; scenario: Scenario; run: number }
  | { name: 'score'; attempt: Attempt; saveNote?: SaveNote; from: 'call' | 'trainer' }
  | { name: 'trainer' }

export default function App() {
  const [view, setView] = useState<View>({ name: 'home' })
  const [agentName, setAgentName] = useState(loadAgentName)
  const [joinedClass, setJoinedClass] = useState<ClassInfo | null>(loadJoinedClass)

  const updateName = (name: string) => {
    setAgentName(name)
    saveAgentName(name)
  }

  const updateClass = (info: ClassInfo | null) => {
    setJoinedClass(info)
    saveJoinedClass(info)
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setView({ name: 'home' })}>
          <span className="brand-mark" aria-hidden>◉</span> CallCraft
        </button>
        <nav>
          <button className="link" onClick={() => setView({ name: 'home' })}>Practice</button>
          <button className="link" onClick={() => setView({ name: 'trainer' })}>Trainer view</button>
        </nav>
      </header>

      <main>
        {view.name === 'home' && (
          <Home
            agentName={agentName}
            onNameChange={updateName}
            classInfo={joinedClass}
            onClassChange={updateClass}
            onStart={(scenario) => setView({ name: 'call', scenario, run: Date.now() })}
          />
        )}
        {view.name === 'call' && (
          <CallScreen
            key={view.run}
            scenario={view.scenario}
            agentName={agentName}
            classInfo={joinedClass}
            onScored={(attempt, saveNote) => setView({ name: 'score', attempt, saveNote, from: 'call' })}
            onCancel={() => setView({ name: 'home' })}
          />
        )}
        {view.name === 'score' && (
          <ScorecardView
            attempt={view.attempt}
            saveNote={view.saveNote}
            backLabel={view.from === 'trainer' ? 'Back to trainer view' : 'Other scenarios'}
            onRetry={
              view.from === 'call'
                ? () => {
                    const scenario = getScenario(view.attempt.scenarioId)
                    setView(scenario ? { name: 'call', scenario, run: Date.now() } : { name: 'home' })
                  }
                : undefined
            }
            onBack={() => setView(view.from === 'trainer' ? { name: 'trainer' } : { name: 'home' })}
          />
        )}
        {view.name === 'trainer' && (
          <TrainerView onOpen={(attempt) => setView({ name: 'score', attempt, from: 'trainer' })} />
        )}
      </main>
    </div>
  )
}
