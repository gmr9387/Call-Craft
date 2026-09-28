const YEAR = new Date().getFullYear()

interface Props {
  onSignIn: () => void
}

const STEPS = [
  { title: 'Pick a practice call', text: 'Each one has a different kind of caller: friendly, rushed, upset, or confused.' },
  { title: 'Talk to the AI caller', text: 'Type or speak. The caller reacts to what the agent says, just like a real person.' },
  { title: 'Get a score and tips', text: 'Right after the call: what went well, what was missed, and exactly what to say next time.' },
]

const CHECKS = [
  { title: 'Every step of the call', text: 'Greeting, verifying the right person, the recording notice, questions, and the transfer.' },
  { title: 'The rules', text: 'Stopping when someone says "don\'t call me," and never promising prices or aid.' },
  { title: 'People skills', text: 'Tone, patience, handling pushback, and staying in control of the call.' },
]

const TRAINER = [
  { title: 'See the whole class', text: 'Every agent\'s scores in one place, and the step each agent misses most.' },
  { title: 'Make your own practice calls', text: 'Describe a caller in one sentence. CallCraft writes the rest. Edit it and share it.' },
  { title: 'Spot problems early', text: 'Rule-breaking calls are flagged, so you can coach before the first real call.' },
]

export default function Marketing({ onSignIn }: Props) {
  return (
    <div className="marketing">
      <header className="mk-nav">
        <span className="brand">
          <span className="brand-mark" aria-hidden>
            ◉
          </span>{' '}
          CallCraft
        </span>
        <nav>
          <a href="#how">How it works</a>
          <a href="#trainers">For trainers</a>
          <button className="primary" onClick={onSignIn}>
            Sign in
          </button>
        </nav>
      </header>

      <section className="mk-hero">
        <div className="mk-hero-text">
          <p className="eyebrow">Call practice for contact center agents</p>
          <h1>Better agents before their first real call.</h1>
          <p className="mk-lead">
            New agents practice real-sounding calls with an AI caller and get scored the moment they hang up. Trainers
            see the whole class in one place.
          </p>
          <div className="mk-cta">
            <button className="primary big" onClick={onSignIn}>
              Sign in
            </button>
            <a className="secondary big as-button" href="#how">
              See how it works
            </a>
          </div>
        </div>

        <div className="mk-preview card" aria-label="Example of a practice call and its score">
          <div className="mk-preview-call">
            <div className="turn prospect">
              <span className="who">Caller</span>
              <p>I've gotten five of these calls this week.</p>
            </div>
            <div className="turn agent">
              <span className="who">Agent</span>
              <p>I'm sorry about that. I'll take you off our list right now.</p>
            </div>
          </div>
          <div className="mk-preview-score">
            <span className="mk-score">92</span>
            <div>
              <span className="status status-pass">✓ Pass</span>
              <p className="small muted">Honored the do-not-call request right away.</p>
            </div>
          </div>
          <p className="small muted mk-example-note">Example</p>
        </div>
      </section>

      <section id="how" className="mk-section">
        <h2>How it works</h2>
        <ol className="mk-steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card">
              <span className="mk-step-num">{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mk-section">
        <h2>What every call is checked for</h2>
        <div className="mk-grid">
          {CHECKS.map((c) => (
            <div key={c.title} className="card">
              <h3>{c.title}</h3>
              <p>{c.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="trainers" className="mk-section">
        <h2>Built for trainers</h2>
        <div className="mk-grid">
          {TRAINER.map((c) => (
            <div key={c.title} className="card">
              <h3>{c.title}</h3>
              <p>{c.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mk-section mk-note card">
        <h2>Practice on a computer, like the real job</h2>
        <p>
          Agents practice on a desktop or laptop, the same way they'll take real calls. Every practice caller is made
          up, so no real customer information is ever used.
        </p>
      </section>

      <section className="mk-final">
        <h2>Ready to try it?</h2>
        <button className="primary big" onClick={onSignIn}>
          Sign in
        </button>
      </section>

      <footer className="mk-footer muted small">© {YEAR} CallCraft</footer>
    </div>
  )
}
