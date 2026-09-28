const YEAR = new Date().getFullYear()

interface Props {
  onSignIn: () => void
}

const STEPS = [
  { title: 'Pick a call', text: 'Friendly, rushed, upset, or confused. Each practice call has a different caller.' },
  { title: 'Talk it through', text: 'Type or speak. The AI caller reacts to what you say, like a real person.' },
  { title: 'Get your score', text: 'See what went well, what you missed, and what to say next time.' },
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
        <button className="primary" onClick={onSignIn}>
          Sign in
        </button>
      </header>

      <section className="mk-hero">
        <div className="mk-hero-text">
          <h1>Practice calls before the real ones.</h1>
          <p className="mk-lead">
            Agents talk to an AI caller and get scored the moment they hang up. Trainers see the whole class in one
            place.
          </p>
          <button className="primary big" onClick={onSignIn}>
            Sign in
          </button>
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

      <section className="mk-section">
        <ol className="mk-steps">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="mk-step-num">{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mk-footer">
        <span className="muted small">© {YEAR} CallCraft · Practice callers are made up. No real customer data.</span>
        <button className="link" onClick={onSignIn}>
          Sign in
        </button>
      </footer>
    </div>
  )
}
