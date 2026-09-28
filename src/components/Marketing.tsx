import { useState } from 'react'

const YEAR = new Date().getFullYear()

// Marketing photos live in public/photos. Until a file is added, its spot stays hidden.
const HERO_PHOTO = '/photos/marketing-hero.webp'
const TEAM_PHOTO = '/photos/marketing-team.webp'

interface Props {
  onSignIn: () => void
}

const FACTS = ['Built for contact center training teams', 'Scored the moment the call ends', 'No real customer data']

const STEPS = [
  { title: 'Pick a call', text: 'Friendly, rushed, upset, or confused. Each practice call has a different caller.' },
  { title: 'Talk it through', text: 'Agents type or speak. The AI caller reacts to what they say, like a real person.' },
  { title: 'Get a score', text: 'Every step, every rule, and people skills, with tips on what to say next time.' },
]

const TRAINER_POINTS = [
  'See every agent’s scores and the step each one misses most.',
  'Describe a caller in one sentence and CallCraft writes the practice call.',
  'Calls that break the rules are flagged, so you can coach early.',
]

function Photo({ src, className }: { src: string; className: string }) {
  const [missing, setMissing] = useState(false)
  if (missing) return null
  return <img className={className} src={src} alt="" onError={() => setMissing(true)} />
}

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
          <p className="eyebrow">Agent training for contact centers</p>
          <h1>Practice calls before the real ones.</h1>
          <p className="mk-lead">
            Agents talk to an AI caller and get scored the moment they hang up. Trainers see the whole class in one
            place.
          </p>
          <div className="mk-cta">
            <button className="primary big" onClick={onSignIn}>
              Sign in
            </button>
            <a className="secondary big as-button" href="#how">
              How it works
            </a>
          </div>
        </div>

        <div className="mk-hero-visual">
          <Photo src={HERO_PHOTO} className="mk-hero-photo" />
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
        </div>
      </section>

      <ul className="mk-facts">
        {FACTS.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>

      <section id="how" className="mk-section">
        <h2>How it works</h2>
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

      <section id="trainers" className="mk-section mk-split">
        <Photo src={TEAM_PHOTO} className="mk-team-photo" />
        <div>
          <h2>Built for trainers</h2>
          <ul className="mk-points">
            {TRAINER_POINTS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <button className="primary big" onClick={onSignIn}>
            Sign in
          </button>
        </div>
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
