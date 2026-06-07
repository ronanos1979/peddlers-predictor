import { track } from '@vercel/analytics'

export function trackEvent(event: string, properties?: Record<string, string | number | boolean>) {
  track(event, properties) // no-ops on free Vercel plan, ready if upgraded
  fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, properties: properties || {} }),
  }).catch(() => {})
}
