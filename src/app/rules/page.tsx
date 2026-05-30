import Link from 'next/link'

export default function RulesPage() {
  return (
    <div className="container">
      <div style={{ marginBottom: 24 }}>
        <h1>Rules &amp; How to Play</h1>
        <p className="muted">The Peddler&apos;s Daughter World Cup 2026 Predictor</p>
      </div>

      {/* Prize */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, #1a1200, #2a1f00)',
        border: '1px solid var(--gold)',
        marginBottom: 24,
        textAlign: 'center',
        padding: '24px 20px'
      }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🏆</div>
        <h2 style={{ color: 'var(--gold)', marginBottom: 6 }}>The Grand Prize</h2>
        <p style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>
          One TV per pub — two winners total!
        </p>
        <p className="muted" style={{ fontSize: 13 }}>
          Drawn by raffle at the end of the World Cup Final on July 19, 2026.
          The more correct predictions you make, the more raffle tickets you earn.
        </p>
      </div>

      {/* How to enter */}
      <div className="rules-section">
        <div className="card">
          <h3 style={{ color: 'var(--green-dark)', marginBottom: 12 }}>📱 How to enter</h3>
          <ul className="rules-list">
            <li>Visit The Peddler&apos;s Daughter in Haverhill, MA or Nashua, NH during any World Cup match</li>
            <li>Scan the QR code at your table or bar, or visit this app on your phone</li>
            <li>Select your location — Haverhill or Nashua</li>
            <li>Enter your name and phone number</li>
            <li>Pick your prediction: Home Win, Draw, or Away Win</li>
            <li>Hit Submit — you&apos;re in!</li>
          </ul>
        </div>
      </div>

      {/* Eligibility */}
      <div className="rules-section">
        <div className="card">
          <h3 style={{ color: 'var(--green-dark)', marginBottom: 12 }}>✅ Eligibility</h3>
          <ul className="rules-list">
            <li>You must be physically present inside The Peddler&apos;s Daughter to enter</li>
            <li>You must be 21 years of age or older</li>
            <li>One prediction per person per match — no changes once submitted</li>
            <li>Your phone number is used to identify you across the tournament — use the same number every time</li>
            <li>Both pubs run separate competitions with separate TV prizes</li>
            <li>Staff of The Peddler&apos;s Daughter are not eligible to win</li>
          </ul>
        </div>
      </div>

      {/* Scoring */}
      <div className="rules-section">
        <div className="card">
          <h3 style={{ color: 'var(--green-dark)', marginBottom: 12 }}>🎯 Scoring &amp; raffle entries</h3>
          <ul className="rules-list">
            <li>Each correct prediction earns you <strong style={{ color: 'var(--gold)' }}>3 raffle entries</strong> toward the TV draw</li>
            <li>Incorrect predictions earn 0 entries — but keep going, every match is a new chance!</li>
            <li>The leaderboard shows total raffle entries — the more correct picks, the better your odds</li>
            <li>You can enter every single match across the tournament — group stage, knockouts, all the way to the Final</li>
            <li>There are 104 matches total, giving a maximum of 312 raffle entries per person</li>
          </ul>
        </div>
      </div>

      {/* Timing */}
      <div className="rules-section">
        <div className="card">
          <h3 style={{ color: 'var(--green-dark)', marginBottom: 12 }}>⏱️ Timing</h3>
          <ul className="rules-list">
            <li>Predictions open at kick-off time for each match</li>
            <li>Predictions close approximately 90 minutes after kick-off — at the scheduled end of the match</li>
            <li>No predictions can be made or changed after entries close</li>
            <li>Results are confirmed by pub staff after each match and the leaderboard updates automatically</li>
          </ul>
        </div>
      </div>

      {/* The draw */}
      <div className="rules-section">
        <div className="card">
          <h3 style={{ color: 'var(--green-dark)', marginBottom: 12 }}>🎲 The TV raffle draw</h3>
          <ul className="rules-list">
            <li>The raffle draw takes place after the World Cup Final on July 19, 2026</li>
            <li>Each pub (Haverhill and Nashua) holds a separate draw for their own TV prize</li>
            <li>Your raffle entries are the total number of correct predictions × 3</li>
            <li>The draw is conducted live at the pub — the more you play, the better your chances</li>
            <li>If the winner is not present, they will be contacted by the phone number they registered with</li>
            <li>Winners have 48 hours to claim their prize. If unclaimed, a new winner will be drawn</li>
            <li>The prize is a TV — exact model and size at the discretion of The Peddler&apos;s Daughter management</li>
          </ul>
        </div>
      </div>

      {/* Fair play */}
      <div className="rules-section">
        <div className="card">
          <h3 style={{ color: 'var(--green-dark)', marginBottom: 12 }}>🤝 Fair play</h3>
          <ul className="rules-list">
            <li>The daily pub code is required to enter — do not share it with people outside the pub</li>
            <li>Entries submitted from outside the pub premises are invalid and will be removed</li>
            <li>Multiple accounts using different phone numbers by the same person are not permitted</li>
            <li>Management reserves the right to disqualify entries that violate the spirit of fair play</li>
            <li>Management&apos;s decisions are final in all matters</li>
          </ul>
        </div>
      </div>

      {/* Privacy */}
      <div className="rules-section">
        <div className="card">
          <h3 style={{ color: 'var(--green-dark)', marginBottom: 12 }}>🔒 Privacy</h3>
          <ul className="rules-list">
            <li>Your phone number and email are used only to contact you if you win and for tournament updates</li>
            <li>Your information will not be shared with third parties or used for marketing without your consent</li>
            <li>Only your first name and last initial appear publicly on the leaderboard</li>
          </ul>
        </div>
      </div>

      {/* Tournament dates */}
      <div className="card" style={{ background: '#0a1a0a', border: '1px solid #1D9E75' }}>
        <h3 style={{ color: 'var(--green-dark)', marginBottom: 12 }}>📅 Tournament dates</h3>
        <div style={{ fontSize: 14, lineHeight: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #222', paddingBottom: 6, marginBottom: 6 }}>
            <span>Group stage</span><span style={{ color: 'var(--text-muted)' }}>June 11 – June 27</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #222', paddingBottom: 6, marginBottom: 6 }}>
            <span>Round of 32</span><span style={{ color: 'var(--text-muted)' }}>June 28 – July 4</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #222', paddingBottom: 6, marginBottom: 6 }}>
            <span>Round of 16</span><span style={{ color: 'var(--text-muted)' }}>July 4 – July 8</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #222', paddingBottom: 6, marginBottom: 6 }}>
            <span>Quarter Finals</span><span style={{ color: 'var(--text-muted)' }}>July 10 – July 12</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #222', paddingBottom: 6, marginBottom: 6 }}>
            <span>Semi Finals</span><span style={{ color: 'var(--text-muted)' }}>July 14 – July 15</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600 }}>🏆 World Cup Final</span>
            <span style={{ color: 'var(--gold)', fontWeight: 600 }}>July 19, 2026</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        <Link href="/" className="btn btn-primary" style={{ textDecoration: 'none', textAlign: 'center' }}>
          ← Make a prediction
        </Link>
        <Link href="/schedule" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>
          📅 View full schedule
        </Link>
      </div>
    </div>
  )
}
