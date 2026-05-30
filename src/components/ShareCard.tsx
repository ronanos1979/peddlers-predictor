'use client'
import { useState, useEffect } from 'react'

const APP_URL = 'https://peddlers-predictor.vercel.app'
const SHARE_TEXT = "⚽ Playing World Cup 2026 Predictor at The Peddler's Daughter! Make picks on every match and win a TV. Join me:"

function drawShareImage(): Promise<string> {
  return new Promise(resolve => {
    const W = 1080, H = 1080
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')!

    // Background
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, W, H)

    // Green top bar
    ctx.fillStyle = '#00C87A'
    ctx.fillRect(0, 0, W, 10)

    // Green bottom bar
    ctx.fillRect(0, H - 10, W, 10)

    // Subtle green glow circle
    const grad = ctx.createRadialGradient(W / 2, 420, 0, W / 2, 420, 520)
    grad.addColorStop(0, 'rgba(0,200,122,0.07)')
    grad.addColorStop(1, 'transparent')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    // Top label
    ctx.fillStyle = '#00C87A'
    ctx.font = 'bold 30px Arial'
    ctx.textAlign = 'center'
    ctx.letterSpacing = '4px'
    ctx.fillText('THE PEDDLER\'S DAUGHTER', W / 2, 80)

    ctx.fillStyle = '#333'
    ctx.fillRect(180, 100, W - 360, 2)

    // Ball emoji (drawn as text — works on all modern canvas)
    ctx.font = '140px serif'
    ctx.fillText('⚽', W / 2, 290)

    // Main headline
    ctx.fillStyle = '#f0ede8'
    ctx.font = 'bold 96px Impact, Arial Black, Arial'
    ctx.fillText('WORLD CUP', W / 2, 420)

    ctx.fillStyle = '#00C87A'
    ctx.font = 'bold 96px Impact, Arial Black, Arial'
    ctx.fillText('PREDICTOR', W / 2, 530)

    // Tagline
    ctx.fillStyle = '#888'
    ctx.font = '34px Arial'
    ctx.fillText('FIFA World Cup 2026 · June 11 – July 19', W / 2, 610)

    // Divider
    ctx.strokeStyle = '#222'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(120, 650)
    ctx.lineTo(W - 120, 650)
    ctx.stroke()

    // Play instructions
    ctx.fillStyle = '#f0ede8'
    ctx.font = 'bold 38px Arial'
    ctx.fillText('Predict matches at the pub — win a TV!', W / 2, 720)

    ctx.fillStyle = '#777'
    ctx.font = '30px Arial'
    ctx.fillText('Haverhill MA  ·  Nashua NH', W / 2, 770)

    // URL pill background
    ctx.fillStyle = '#111'
    ctx.strokeStyle = '#00C87A'
    ctx.lineWidth = 2
    const rx = 160, ry = 830, rw = W - 320, rh = 70, r = 12
    ctx.beginPath()
    ctx.moveTo(rx + r, ry)
    ctx.lineTo(rx + rw - r, ry)
    ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + r)
    ctx.lineTo(rx + rw, ry + rh - r)
    ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - r, ry + rh)
    ctx.lineTo(rx + r, ry + rh)
    ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r)
    ctx.lineTo(rx, ry + r)
    ctx.quadraticCurveTo(rx, ry, rx + r, ry)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#00C87A'
    ctx.font = 'bold 34px Arial'
    ctx.fillText('peddlers-predictor.vercel.app', W / 2, 875)

    // Prize callout
    ctx.fillStyle = '#F5C518'
    ctx.font = 'bold 32px Arial'
    ctx.fillText('🏆  Win a TV — Grand Raffle · July 19', W / 2, 970)

    canvas.toBlob(blob => {
      resolve(URL.createObjectURL(blob!))
    }, 'image/png')
  })
}

export default function ShareCard() {
  const [hasNativeShare, setHasNativeShare] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setHasNativeShare(!!navigator.share)
  }, [])

  async function handleNativeShare() {
    try {
      await navigator.share({ title: "Peddler's Predictor — World Cup 2026", text: SHARE_TEXT, url: APP_URL })
    } catch { /* cancelled */ }
  }

  function handleFacebook() {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(APP_URL)}`,
      '_blank', 'width=600,height=400,noopener'
    )
  }

  function handleTwitter() {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(APP_URL)}`,
      '_blank', 'width=600,height=400,noopener'
    )
  }

  async function handleSaveImage() {
    setSaving(true)
    try {
      const url = await drawShareImage()
      const a = document.createElement('a')
      a.href = url
      a.download = 'peddlers-wc2026.png'
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card" style={{ marginTop: 24, textAlign: 'center', padding: '24px 20px' }}>
      <div style={{ fontSize: 32, marginBottom: 6 }}>📣</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, letterSpacing: 1, marginBottom: 4 }}>Love the app?</div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18 }}>
        Spread the word — bring more friends to the pub and grow the competition!
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {hasNativeShare && (
          <button onClick={handleNativeShare} className="btn btn-primary" style={{ width: '100%', cursor: 'pointer' }}>
            Share with friends ↑
          </button>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button onClick={handleFacebook} className="share-btn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Facebook
          </button>
          <button onClick={handleTwitter} className="share-btn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            Twitter / X
          </button>
        </div>

        <button
          onClick={handleSaveImage}
          disabled={saving}
          className="share-btn"
          style={{ color: 'var(--text-muted)', borderColor: 'var(--border)', fontSize: 12 }}
        >
          {saving ? '⏳ Generating…' : '📸 Save image for Instagram'}
        </button>
      </div>
    </div>
  )
}
