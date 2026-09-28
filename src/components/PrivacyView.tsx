// Plain-language privacy notice and terms for CallCraft. The organization running this site
// should have its own counsel review this text before real use.
export default function PrivacyView({ onBack }: { onBack?: () => void }) {
  return (
    <div className="history privacy">
      <div className="page-head">
        {onBack && (
          <button className="link back-link" onClick={onBack}>
            ← Back
          </button>
        )}
        <h1>Privacy and terms</h1>
        <p className="muted">Plain-language answers about what CallCraft keeps and how it's used.</p>
      </div>

      <section className="card">
        <h2>Practice only: never use real customer information</h2>
        <p>
          Every caller in CallCraft is made up. Don't type or say real customer names, phone numbers, account numbers,
          health details, or anything else about a real person during a practice call.
        </p>
      </section>

      <section className="card">
        <h2>What CallCraft keeps</h2>
        <ul>
          <li>
            <strong>Your account:</strong> your name, email, role, and class. Your password is stored scrambled (as a
            one-way hash), so no one can read it.
          </li>
          <li>
            <strong>Your practice calls:</strong> what you and the practice caller said, how long the call took, the
            scorecard, and any note or corrected score from a trainer.
          </li>
          <li>
            <strong>Usage counts:</strong> how many AI requests each person makes, to keep costs in check. People are
            counted by a scrambled ID, not by name.
          </li>
          <li>
            <strong>An activity log</strong> of admin and trainer actions (invites, password resets, account and class
            changes), so admins can see who changed what.
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>Who can see it</h2>
        <ul>
          <li>You can see your own calls.</li>
          <li>Your trainer can see the calls of agents in the classes they run.</li>
          <li>Admins of this CallCraft site can see all classes, people, and the activity log.</li>
        </ul>
      </section>

      <section className="card">
        <h2>How it's processed</h2>
        <p>
          To play the practice caller and score calls, the words of the call are sent to Anthropic's Claude AI service
          under Anthropic's commercial terms. CallCraft runs on Vercel (hosting) and Supabase (database).
        </p>
      </section>

      <section className="card">
        <h2>How long it's kept, and deleting it</h2>
        <p>
          Calls are kept for the period set by this site's admins, then deleted automatically. To have your account and
          all your calls deleted, ask an admin; they can delete them from the People page.
        </p>
      </section>

      <section className="card">
        <h2>Terms of use</h2>
        <ul>
          <li>CallCraft is for training. Scores are coaching feedback, not a final judgment of anyone's work.</li>
          <li>Keep your password to yourself. Don't share accounts.</li>
          <li>Don't try to misuse the AI caller or get around the site's limits.</li>
        </ul>
      </section>
    </div>
  )
}
