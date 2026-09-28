import type { Me, Role } from '../../shared/accounts.ts'

interface Topic {
  q: string
  a: string[]
}

interface Section {
  title: string
  roles: Role[]
  topics: Topic[]
}

const SECTIONS: Section[] = [
  {
    title: 'Practicing calls',
    roles: ['agent', 'trainer', 'admin'],
    topics: [
      {
        q: 'How do I start a practice call?',
        a: ['On your Dashboard, click "Start this call". Or open Practice and pick any call.'],
      },
      {
        q: 'How do I talk on the call?',
        a: [
          'Type what you would say and click Send. The caller answers like a real person.',
          'In Chrome or Edge you can click "🎙 Speak" and talk instead of typing.',
          'Turn on "Call guide" to see the steps of the call while you talk.',
        ],
      },
      {
        q: 'How do I get my score?',
        a: [
          'Click "End call", then "Score my call". It takes about 20 seconds.',
          'The scorecard shows each step of the call, the rules, your people skills, and tips for next time.',
        ],
      },
      { q: 'Where are my old calls?', a: ['Open "My calls". Every call you scored is there, on any computer.'] },
      {
        q: 'I forgot my password.',
        a: ['Ask your trainer. They can make you a reset link that lets you pick a new password.'],
      },
      {
        q: 'It says "You\'re going a little fast" or "today\'s practice limit".',
        a: ['CallCraft limits how much AI each person and the whole site can use. Wait a few minutes, or try tomorrow.'],
      },
    ],
  },
  {
    title: 'Running a class',
    roles: ['trainer', 'admin'],
    topics: [
      {
        q: 'How do I set up a new class?',
        a: [
          '1. Pick the call flow: the steps and rules your agents are scored on. Use one from "Call flows", or click "+ New call flow" and describe the call.',
          '2. On Classes, type a class name, choose the call flow, and click "Create class".',
          '3. Copy the sign-up link and send it to your agents. They make an account and land in your class.',
          '4. Open the Scenarios tab and click "+ New scenario" to make practice calls. Describe the caller in one sentence and click "Write it for me".',
        ],
      },
      {
        q: 'How do I see how agents are doing?',
        a: [
          'Open the class and use the Results tab: scores by agent, by scenario, and every call. Click View to read a call and its scorecard.',
          'Click "Download results" for a spreadsheet you can share with managers.',
        ],
      },
      {
        q: 'An agent is locked out, typed their name wrong, or is in the wrong class.',
        a: [
          'Open the class, then the Agents tab. Use Edit (name and email), Reset password (a link to send them), "Move to…" (another of your classes), or Remove.',
        ],
      },
      {
        q: 'Can I try a practice call before my agents do?',
        a: ['Yes. On the Scenarios tab, click "Try it". Trainer test calls are never saved or scored for the class.'],
      },
      {
        q: 'The class is finished.',
        a: ['Open the class, then Settings, then "Archive class". The code stops working, and results are kept.'],
      },
      {
        q: 'Our program changed its script.',
        a: [
          'Open Call flows and edit the flow. Changes apply to the next calls scored. Past scorecards stay as they were.',
        ],
      },
    ],
  },
  {
    title: 'Running CallCraft (admins)',
    roles: ['admin'],
    topics: [
      {
        q: 'How do I add a trainer?',
        a: ['Open People, click "Invite a trainer", and send them the link. It works once and lasts 7 days.'],
      },
      {
        q: 'Someone left the company.',
        a: [
          'On People, click "Turn off" next to their name. They are signed out right away.',
          "If they were a trainer, open each of their classes, go to Settings, and hand the class to someone else.",
        ],
      },
      {
        q: 'Is the AI working? How much are we using?',
        a: [
          'Open System. It shows AI use today and this week, and a warning if the AI stopped working. Click "Check now" to test it.',
          'Trainers and admins also see a red banner at the top of every page when the AI has a problem.',
        ],
      },
      {
        q: 'How do I control the AI bill?',
        a: [
          'On System, change the spending limits. The daily limit is the main cap. Set it to 0 to pause all practice.',
          'Also set a monthly limit and auto-reload in your Anthropic account, so practice never stops in the middle of a class.',
        ],
      },
    ],
  },
]

export default function HelpView({ user }: { user: Me }) {
  const sections = SECTIONS.filter((s) => s.roles.includes(user.role))
  return (
    <div className="history help">
      <div className="page-head">
        <h1>Help</h1>
        <p className="muted">Short answers to common questions. Click a question to open it.</p>
      </div>
      {sections.map((section) => (
        <section key={section.title} className="card">
          <h2>{section.title}</h2>
          {section.topics.map((t) => (
            <details key={t.q} className="help-topic">
              <summary>{t.q}</summary>
              {t.a.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </details>
          ))}
        </section>
      ))}
    </div>
  )
}
