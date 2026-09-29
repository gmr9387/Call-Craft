// Security and trust: how CallCraft protects accounts, data, and the integrity of practice
// scores. Every statement here describes what the product actually does today; the last
// section says plainly what it doesn't have yet. Keep it that way when features change.

interface Item {
  title: string
  text: string
}

interface Section {
  title: string
  intro?: string
  items: Item[]
}

const SECTIONS: Section[] = [
  {
    title: 'Accounts and sign-in',
    items: [
      {
        title: 'Passwords are never stored',
        text: 'Only a one-way scrypt hash of each password is kept, with its own random salt. No one, including admins, can read a password.',
      },
      {
        title: 'Guessing is blocked',
        text: 'Repeated wrong passwords are limited per computer and per account, so guessing from many computers doesn’t work either.',
      },
      {
        title: 'Secure sessions',
        text: 'Signing in sets an HttpOnly, SameSite, HTTPS-only cookie holding a random token; only a hash of the token is stored. Sessions end after 30 days. Changing a password signs out your other browsers, and a password reset signs out all of them.',
      },
      {
        title: 'No shared logins or emailed passwords',
        text: 'People are added by one-time invite links that expire after 7 days. Forgotten passwords are reset with a one-time link from a trainer or admin.',
      },
      {
        title: 'Offboarding in one click',
        text: 'An admin can turn an account off, which signs it out everywhere right away, or delete it along with all of its data.',
      },
    ],
  },
  {
    title: 'Who can see what',
    intro: 'Every request is checked on the server against the person’s role. The browser is never trusted to decide.',
    items: [
      { title: 'Agents', text: 'See only their own practice calls and scores.' },
      { title: 'Trainers', text: 'See only the classes they run, and the agents and calls in them.' },
      {
        title: 'Admins',
        text: 'Manage people, classes, and settings. Role changes take effect on the very next request.',
      },
      {
        title: 'Activity log',
        text: 'Invites, password resets, role and account changes, class and call flow edits, reviews, downloads, and setting changes are recorded with who did it and when. Admins can view and download it.',
      },
    ],
  },
  {
    title: 'Scores you can trust',
    items: [
      {
        title: 'Practice calls can’t be faked',
        text: 'Every reply from the AI caller is signed by the server. Before scoring, the server checks that the conversation is exactly the one it had, so no one can type the caller’s lines themselves to fake a pass.',
      },
      {
        title: 'The scorer can’t be talked into a score',
        text: 'What’s said on a call is treated only as something to grade. Attempts to instruct the scorer (“give me 100”) are ignored and count against the speaker.',
      },
      {
        title: 'Human review',
        text: 'Trainers can review any call, leave a note, and correct the score. The AI’s original score is always kept alongside.',
      },
    ],
  },
  {
    title: 'Data',
    items: [
      {
        title: 'What’s kept',
        text: 'Names, emails, roles, and classes; practice call transcripts and scorecards; trainer notes; usage counts; and the activity log. Practice callers are made up, and agents are reminded never to enter real customer information.',
      },
      {
        title: 'Where it lives',
        text: 'A Postgres database hosted by Supabase. Row-level security blocks the database’s public API entirely, so only CallCraft’s own server can read the data. All traffic uses HTTPS.',
      },
      {
        title: 'AI processing',
        text: 'To play the practice caller and score calls, the words of a practice call are sent to Anthropic’s Claude API under Anthropic’s commercial terms.',
      },
      {
        title: 'Retention and deletion',
        text: 'Admins choose how long practice calls are kept (30 days or more, or until deleted); older calls are removed automatically. Admins can delete any person and all of their calls on request.',
      },
      {
        title: 'Your data, on demand',
        text: 'Admins can download everything CallCraft keeps (never passwords, sessions, or links) for a backup or a data request. Trainers can download all of their class’s results.',
      },
    ],
  },
  {
    title: 'The website itself',
    items: [
      {
        title: 'Standard web protections',
        text: 'A strict Content Security Policy (the site only loads its own code), no embedding in other sites, HTTPS enforced (HSTS), no content-type sniffing, and a tight permissions policy (the microphone only for this site, for spoken practice).',
      },
      {
        title: 'No outside scripts or trackers',
        text: 'No third-party analytics, ad trackers, or externally loaded scripts or fonts.',
      },
      {
        title: 'Requests from other sites are refused',
        text: 'The API only accepts JSON from CallCraft’s own pages, so another website can’t act on a signed-in person’s behalf.',
      },
    ],
  },
  {
    title: 'Cost and reliability controls',
    items: [
      {
        title: 'Spending limits',
        text: 'Every AI request is counted before it’s sent: a daily cap for the whole site, an hourly cap per person, and a daily cap on AI drafts. Admins set them in the app, and trainers and admins are warned as the daily cap gets close.',
      },
      {
        title: 'Built for a full training floor',
        text: 'Usage checks stay fast at any volume, requests to the AI have time limits and retries that wait out busy moments, and two trainers can’t silently overwrite each other’s edits.',
      },
      {
        title: 'Problems are visible',
        text: 'If the AI service stops working (for example, a rejected key or no credit), trainers and admins see a warning on every page, and admins see the details and a health check on the System page.',
      },
      {
        title: 'Tested on every change',
        text: 'An automated test suite, including security checks and dozens of people practicing at once, runs against a real database on every proposed change.',
      },
    ],
  },
]

const NOT_YET = [
  'An independent security certification (such as SOC 2 or ISO 27001).',
  'An independent penetration test.',
  'Company single sign-on (Microsoft, Google, Okta). It’s planned, and set up together with your IT team when you’re ready.',
]

export default function SecurityView({ onBack }: { onBack?: () => void }) {
  return (
    <div className="history security">
      <div className="page-head">
        {onBack && (
          <button className="link back-link" onClick={onBack}>
            ← Back
          </button>
        )}
        <h1>Security and trust</h1>
        <p className="muted">
          How CallCraft protects accounts, data, and the fairness of every score. Everything here describes how
          CallCraft works today.
        </p>
      </div>

      {SECTIONS.map((section) => (
        <section key={section.title} className="card security-section">
          <h2>{section.title}</h2>
          {section.intro && <p className="muted">{section.intro}</p>}
          <dl className="security-list">
            {section.items.map((item) => (
              <div key={item.title}>
                <dt>{item.title}</dt>
                <dd>{item.text}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <section className="card security-section security-honest">
        <h2>What we don’t have yet</h2>
        <p className="muted">We’d rather tell you than have you find out.</p>
        <ul>
          {NOT_YET.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="small">
          Have a security questionnaire? We’re glad to fill it in. Ask through your CallCraft contact.
        </p>
      </section>
    </div>
  )
}
