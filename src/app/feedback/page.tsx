'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

function FeedbackContent() {
  const searchParams = useSearchParams()
  const [message, setMessage] = useState('')
  const [email, setEmail]     = useState('')
  const [page, setPage]       = useState('')
  const [status, setStatus]   = useState<'idle' | 'sending' | 'done' | 'error'>('idle')

  useEffect(() => {
    setPage(window.location.href)
    const prefill = searchParams.get('msg')
    if (prefill) setMessage(decodeURIComponent(prefill))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setStatus('sending')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, email, page }),
      })
      setStatus(res.ok ? 'done' : 'error')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🙏</div>
        <h1 style={{ marginBottom: 8 }}>Thanks!</h1>
        <p className="muted" style={{ marginBottom: 24 }}>
          Your feedback has been sent to the team. We'll look into it.
        </p>
        <Link href="/" className="btn btn-primary" style={{ textDecoration: 'none' }}>
          ← Back to the app
        </Link>
      </div>
    )
  }

  return (
    <div className="container">
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-cond)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--green)', marginBottom: 4 }}>
          Peddler&apos;s Predictor
        </div>
        <h1 style={{ marginBottom: 6 }}>Bug report / Feedback</h1>
        <p className="muted" style={{ fontSize: 14 }}>
          Found something broken? Have a suggestion? Let us know — we read everything.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
            What&apos;s the issue? *
          </label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            required
            rows={5}
            placeholder="Describe what happened, what page you were on, and what you expected to see…"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '12px 14px',
              color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font-body)',
              resize: 'vertical', outline: 'none',
            }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontFamily: 'var(--font-cond)', fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
            Your email <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional — if you want a reply)</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '12px 14px',
              color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font-body)',
              outline: 'none',
            }}
          />
        </div>

        {status === 'error' && (
          <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>
            Something went wrong. Please try again.
          </p>
        )}

        <button
          type="submit"
          disabled={status === 'sending' || !message.trim()}
          className="btn btn-primary"
          style={{ width: '100%', cursor: 'pointer', opacity: !message.trim() ? 0.5 : 1 }}
        >
          {status === 'sending' ? 'Sending…' : 'Send Feedback'}
        </button>
      </form>

      <Link href="/" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center', marginTop: 10 }}>
        ← Back
      </Link>
    </div>
  )
}

export default function FeedbackPage() {
  return <Suspense><FeedbackContent /></Suspense>
}
