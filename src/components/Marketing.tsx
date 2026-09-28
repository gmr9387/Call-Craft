import { useEffect, useRef, useState, type CSSProperties } from 'react'

const YEAR = new Date().getFullYear()

// Marketing photos live in public/photos. Until a file is added, its spot stays hidden.
const HERO_PHOTO = '/photos/marketing-hero.webp'
const TEAM_PHOTO = '/photos/marketing-team.webp'

interface Props {
  onSignIn: () => void
}

const FACTS = ['Built for contact center training teams', 'Scored the moment the call ends', 'No real customer data']

const BENEFITS = [
  {
    icon: '⏱',
    title: 'Ready sooner',
    text: 'Agents practice as many calls as they need before going live, instead of learning on real customers.',
  },
  {
    icon: '🛡',
    title: 'Fewer rule-breaking calls',
    text: 'Mistakes like ignoring "don’t call me" or quoting prices get caught in practice, not on a live call.',
  },
  {
    icon: '📋',
    title: 'Coaching that scales',
    text: 'Every call is scored the same way, so trainers spend their time where agents actually struggle.',
  },
  {
    icon: '✓',
    title: 'Safe to fail',
    text: 'Every caller is made up. Agents can try, miss, and try again without any risk to a real customer.',
  },
]

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

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Counts up to the value once `start` is true (instantly when motion is reduced).
function CountUp({ to, start, delayMs }: { to: number; start: boolean; delayMs: number }) {
  const [value, setValue] = useState(0)
  const instant = start && reducedMotion()
  useEffect(() => {
    if (!start || instant) return
    let frame = 0
    const timer = setTimeout(() => {
      const began = performance.now()
      const tick = (now: number) => {
        const t = Math.min(1, (now - began) / 900)
        setValue(Math.round(to * (1 - Math.pow(1 - t, 3))))
        if (t < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }, delayMs)
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(frame)
    }
  }, [to, start, instant, delayMs])
  return <>{instant ? to : value}</>
}

// Marks [data-reveal] elements with data-shown as they scroll into view (CSS does the animation).
function useScrollReveal(onPreviewShown: () => void) {
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const targets = root.querySelectorAll<HTMLElement>('[data-reveal]')
    if (!('IntersectionObserver' in window)) {
      targets.forEach((el) => el.setAttribute('data-shown', ''))
      onPreviewShown()
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const el = entry.target as HTMLElement
          el.setAttribute('data-shown', '')
          if (el.classList.contains('mk-preview')) onPreviewShown()
          observer.unobserve(el)
        }
      },
      { threshold: 0.2 },
    )
    targets.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [onPreviewShown])
  return rootRef
}

const delay = (i: number) => ({ '--reveal-delay': `${i * 0.1}s` }) as CSSProperties

function Photo({ src, className, ...rest }: { src: string; className: string; 'data-reveal'?: boolean }) {
  const [missing, setMissing] = useState(false)
  if (missing) return null
  return <img className={className} src={src} alt="" onError={() => setMissing(true)} {...rest} />
}

export default function Marketing({ onSignIn }: Props) {
  const [previewShown, setPreviewShown] = useState(false)
  const [showPreview] = useState(() => () => setPreviewShown(true))
  const rootRef = useScrollReveal(showPreview)

  return (
    <div className="marketing" ref={rootRef}>
      <header className="mk-nav">
        <span className="brand">
          <span className="brand-mark" aria-hidden>
            ◉
          </span>{' '}
          CallCraft
        </span>
        <nav>
          <a href="#why">Why CallCraft</a>
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
        </div>
      </section>

      <ul className="mk-facts" data-reveal>
        {FACTS.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>

      <section id="why" className="mk-section">
        <h2 data-reveal>Why CallCraft</h2>
        <div className="mk-benefits">
          {BENEFITS.map((b, i) => (
            <div key={b.title} className="card mk-benefit" data-reveal style={delay(i)}>
              <span className="mk-benefit-icon" aria-hidden>
                {b.icon}
              </span>
              <h3>{b.title}</h3>
              <p>{b.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="mk-section">
        <h2 data-reveal>How it works</h2>
        <div className="mk-how">
          <ol className="mk-steps">
            {STEPS.map((s, i) => (
              <li key={s.title} data-reveal style={delay(i)}>
                <span className="mk-step-num">{i + 1}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mk-preview card" data-reveal aria-label="Example of a practice call and its score">
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
              <span className="mk-score">
                  <CountUp to={92} start={previewShown} delayMs={1900} />
                </span>
              <div>
                <span className="status status-pass">✓ Pass</span>
                <p className="small muted">Honored the do-not-call request right away.</p>
              </div>
            </div>
            <p className="small muted mk-example-note">Example</p>
          </div>
        </div>
      </section>

      <section id="trainers" className="mk-section mk-split">
        <Photo src={TEAM_PHOTO} className="mk-team-photo" data-reveal />
        <div data-reveal style={delay(1)}>
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
