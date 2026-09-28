import { useState } from 'react'
import { getScenario, type Scenario } from '../shared/scenarios.ts'
import type { Attempt } from './history.ts'
import { loadAgentName, saveAgentName } from './history.ts'
import Home from './components/Home.tsx'
import CallScreen from './components/CallScreen.tsx'
import ScorecardView from './components/ScorecardView.tsx'
import HistoryView from './components/HistoryView.tsx'

type View =
  | { name: 'home' }
  | { name: 'call'; scenario: Scenario; run: number }
  | { name: 'score'; attempt: Attempt }
  | { name: 'history' }

export default function App() {
  const [view, setView] = useState<View>({ name: 'home' })
  const [agentName, setAgentName] = useState(loadAgentName)

  const updateName = (name: string) => {
    setAgentName(name)
    saveAgentName(name)
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setView({ name: 'home' })}>
          <span className="brand-mark" aria-hidden>◉</span> CallCraft
        </button>
        <nav>
          <button className="link" onClick={() => setView({ name: 'home' })}>Practice</button>
          <button className="link" onClick={() => setView({ name: 'history' })}>Trainer view</button>
        </nav>
      </header>

      <main>
        {view.name === 'home' && (
          <Home
            agentName={agentName}
            onNameChange={updateName}
            onStart={(scenario) => setView({ name: 'call', scenario, run: Date.now() })}
          />
        )}
        {view.name === 'call' && (
          <CallScreen
            key={view.run}
            scenario={view.scenario}
            agentName={agentName}
            onScored={(attempt) => setView({ name: 'score', attempt })}
            onCancel={() => setView({ name: 'home' })}
          />
        )}
        {view.name === 'score' && (
          <ScorecardView
            attempt={view.attempt}
            onRetry={() => {
              const scenario = getScenario(view.attempt.scenarioId)
              setView(scenario ? { name: 'call', scenario, run: Date.now() } : { name: 'home' })
            }}
            onHome={() => setView({ name: 'home' })}
          />
        )}
        {view.name === 'history' && <HistoryView onOpen={(attempt) => setView({ name: 'score', attempt })} />}
      </main>
    </div>
  )
}
