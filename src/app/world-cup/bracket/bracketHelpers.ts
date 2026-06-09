export function isPlaceholder(name: string) {
  return /\b(TBD|Winner|Runner-up|3rd Place|R32|QF|SF|Group)\b/i.test(name)
}

// Parse group letters out of a placeholder string
// "Group A Winner"        → ["A"]
// "Group B Runner-up"     → ["B"]
// "3rd Place (A/B/C/D/F)" → ["A","B","C","D","F"]
// "R32 M73 Winner"        → []
export function parseGroupLetters(name: string): string[] {
  const thirdMatch = name.match(/3rd Place \(([^)]+)\)/i)
  if (thirdMatch) return thirdMatch[1].split('/').map(s => s.trim())
  const groupMatch = name.match(/Group ([A-L])/i)
  if (groupMatch) return [groupMatch[1].toUpperCase()]
  return []
}

// Format a DB placeholder into a readable label
// "Group A Winner"        → "1st · Group A"
// "Group B Runner-up"     → "2nd · Group B"
// "3rd Place (A/B/C/D/F)" → "Best 3rd · A / B / C / D / F"
// "R32 M73 Winner"        → "R32 M73 Winner" (kept as-is for R16+)
export function formatPlaceholder(name: string): string {
  const winnerMatch = name.match(/^Group ([A-L]) Winner$/i)
  if (winnerMatch) return `1st · Group ${winnerMatch[1].toUpperCase()}`
  const runnerMatch = name.match(/^Group ([A-L]) Runner-up$/i)
  if (runnerMatch) return `2nd · Group ${runnerMatch[1].toUpperCase()}`
  const thirdMatch = name.match(/3rd Place \(([^)]+)\)/i)
  if (thirdMatch) return `Best 3rd · ${thirdMatch[1].split('/').map(s => s.trim()).join(' / ')}`
  return name
}
