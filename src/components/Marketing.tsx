import { useEffect, useRef, useState, type CSSProperties } from 'react'

const YEAR = new Date().getFullYear()

const HERO_PHOTO = '/photos/marketing-hero.webp'
const TEAM_PHOTO = '/photos/marketing-team.webp'

interface Props {
  onSignIn: () => void
  onPrivacy: () => void
}

// The page reads like a magazine feature: a cover photo, a short introduction, then a few
// numbered chapters in large type, a pull quote, and a closing line.
const CHAPTERS = [
  {
    title: 'Agents practice with an AI caller.',
    text: 'Friendly, rushed, upset, or confused. Each practice call has a different person on the other end, and they react to exactly what the agent says. Agents can type or talk, and try again as many times as they need.',
  },
  {
    title: 'Every call is scored the same way.',
    text: 'The moment a call ends, the agent gets a scorecard: each step of the call, every rule, and people skills like tone and empathy, with tips on what to say next time. Mistakes like quoting a price or ignoring “don’t call me” are caught in practice, not on a live call.',
    figure: true,
  },
  {
    title: 'Trainers see who’s ready.',
    text: 'Every agent’s scores in one place, the step each one misses most, and a clear “Ready for live calls” once they’ve passed the calls that matter. Trainers can leave a note on any call, or correct a score.',
  },
  {
    title: 'Any program, no developers.',
    text: 'Describe a call in a few sentences and CallCraft writes the steps and the rules. A small training team sets up programs, classes, and people on its own.',
  },
]

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Counts up to the value once `start` is true (instantly when motion is reduced).
function CountUp({ to, start }: { to: number; start: boolean }) {
  const [value, setValue] = useState(0)
  const instant = start && reducedMotion()
  useEffect(() => {
    if (!start || instant) return
    let frame = 0
    const began = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / 1100)
      setValue(Math.round(to * (1 - Math.pow(1 - t, 3))))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [to, start, instant])
  return <>{instant ? to : value}</>
}

// Marks [data-reveal] elements with data-shown as they scroll into view (CSS does the animation).
function useScrollReveal(onFigureShown: () => void) {
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const targets = root.querySelectorAll<HTMLElement>('[data-reveal]')
    if (!('IntersectionObserver' in window)) {
      targets.forEach((el) => el.setAttribute('data-shown', ''))
      onFigureShown()
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const el = entry.target as HTMLElement
          el.setAttribute('data-shown', '')
          if (el.classList.contains('mag-figure')) onFigureShown()
          observer.unobserve(el)
        }
      },
      { threshold: 0.2 },
    )
    targets.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [onFigureShown])
  return rootRef
}

const delay = (i: number) => ({ '--reveal-delay': `${i * 0.12}s` }) as CSSProperties

export default function Marketing({ onSignIn, onPrivacy }: Props) {
  const [figureShown, setFigureShown] = useState(false)
  const [showFigure] = useState(() => () => setFigureShown(true))
  const rootRef = useScrollReveal(showFigure)

  return (
    <div className="mag" ref={rootRef}>
      <header className="mag-nav">
        <span className="mag-brand">CallCraft</span>
        <nav>
          <a href="#story">The idea</a>
          <a href="#chapters">How it works</a>
          <button className="link mag-signin" onClick={onSignIn}>
            Sign in →
          </button>
        </nav>
      </header>

      <section className="mag-cover" aria-label="CallCraft">
        <img src={HERO_PHOTO} alt="" className="mag-cover-photo" />
        <div className="mag-cover-text">
          <p className="mag-kicker">Agent training for contact centers</p>
          <h1>
            Practice calls
            <br />
            before the real ones.
          </h1>
          <button className="mag-cover-button" onClick={onSignIn}>
            Sign in
          </button>
        </div>
      </section>

      <section id="story" className="mag-intro" data-reveal>
        <p className="mag-lead">
          <span className="mag-dropcap">N</span>ew agents usually learn on real customers. Every missed step, every
          quoted price, every “please stop calling me” that gets ignored happens on a live call.
        </p>
        <p>
          CallCraft gives agents somewhere safe to get it wrong first. They practice with an AI caller, get scored the
          moment they hang up, and practice again, until they’re ready.
        </p>
      </section>

      <section id="chapters" className="mag-chapters" aria-label="How it works">
        {CHAPTERS.map((c, i) => (
          <article key={c.title} className="mag-chapter" data-reveal style={delay(0)}>
            <span className="mag-number" aria-hidden>
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="mag-chapter-body">
              <h2>{c.title}</h2>
              <p>{c.text}</p>
              {c.figure && (
                <figure className="mag-figure" data-reveal style={delay(1)}>
                  <div className="mag-scorecard">
                    <span className="mag-score">
                      <CountUp to={92} start={figureShown} />
                    </span>
                    <div>
                      <span className="status status-pass">✓ Pass</span>
                      <p className="small">Honored the do-not-call request right away.</p>
                    </div>
                  </div>
                  <figcaption>An example score. Every call gets one the moment it ends.</figcaption>
                </figure>
              )}
            </div>
          </article>
        ))}
      </section>

      <blockquote className="mag-quote" data-reveal>
        <p>“The mistakes get made in practice, not on a live call.”</p>
      </blockquote>

      <figure className="mag-band" data-reveal>
        <img src={TEAM_PHOTO} alt="" />
        <figcaption>Every practice caller is made up. No real customer data, ever.</figcaption>
      </figure>

      <section className="mag-closing" data-reveal>
        <h2>Ready when your agents are.</h2>
        <p>Trainers set up a class in about ten minutes. Agents join with a link.</p>
        <button className="primary big" onClick={onSignIn}>
          Sign in
        </button>
      </section>

      <footer className="mag-footer">
        <span>© {YEAR} CallCraft · Practice callers are made up. No real customer data.</span>
        <span className="mag-footer-links">
          <button className="link" onClick={onPrivacy}>
            Privacy and terms
          </button>
          <button className="link" onClick={onSignIn}>
            Sign in
          </button>
        </span>
      </footer>
    </div>
  )
}
