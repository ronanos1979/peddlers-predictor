// "Match 73 Winner" → 73,  "Match 101 Loser" → 101,  "R32 M73 Winner" → 73 (legacy)
// "Round of 32 N Winner" → 72+N,  "Round of 16 N Winner" → 88+N
// "Quarterfinal N Winner" → 96+N,  "Semifinal N Winner/Loser" → 100+N
export function parseMatchNumber(name: string): number | null {
  // "Match 73 Winner/Loser" or legacy "R32 M73 Winner"
  let m = name.match(/(?:Match\s+|M)(\d+)\s+(?:Winner|Loser)/i)
  if (m) return parseInt(m[1], 10)
  // "Round of 32 N Winner/Loser" — relative R32 position, offset by 72
  m = name.match(/^Round of 32 (\d+) (Winner|Loser)$/i)
  if (m) return 72 + parseInt(m[1], 10)
  // "Round of 16 N Winner/Loser" — relative R16 position, offset by 88
  m = name.match(/^Round of 16 (\d+) (Winner|Loser)$/i)
  if (m) return 88 + parseInt(m[1], 10)
  // "Quarterfinal N Winner/Loser" — relative QF position, offset by 96
  m = name.match(/^Quarterfinal (\d+) (Winner|Loser)$/i)
  if (m) return 96 + parseInt(m[1], 10)
  // "Semifinal N Winner/Loser" — relative SF position, offset by 100
  m = name.match(/^Semifinal (\d+) (Winner|Loser)$/i)
  if (m) return 100 + parseInt(m[1], 10)
  return null
}

export function isPlaceholder(name: string) {
  return /\b(TBD|Winner|Loser|Runner-up|3rd Place|R32|QF|SF|Group|Match)\b/i.test(name)
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
// "Round of 32 N Winner"  → "R32 Match N Winner"
// "Round of 16 N Winner"  → "R16 Match N Winner"
// "Quarterfinal N Winner" → "QF Match N Winner"
// "Semifinal N Winner"    → "SF Match N Winner/Loser"
export function formatPlaceholder(name: string): string {
  const winnerMatch = name.match(/^Group ([A-L]) Winner$/i)
  if (winnerMatch) return `1st · Group ${winnerMatch[1].toUpperCase()}`
  const runnerMatch = name.match(/^Group ([A-L]) Runner-up$/i)
  if (runnerMatch) return `2nd · Group ${runnerMatch[1].toUpperCase()}`
  const thirdMatch = name.match(/3rd Place \(([^)]+)\)/i)
  if (thirdMatch) return `Best 3rd · ${thirdMatch[1].split('/').map(s => s.trim()).join(' / ')}`
  let m = name.match(/^Round of 32 (\d+) (Winner|Loser)$/i)
  if (m) return `R32 Match ${m[1]} ${m[2]}`
  m = name.match(/^Round of 16 (\d+) (Winner|Loser)$/i)
  if (m) return `R16 Match ${m[1]} ${m[2]}`
  m = name.match(/^Quarterfinal (\d+) (Winner|Loser)$/i)
  if (m) return `QF Match ${m[1]} ${m[2]}`
  m = name.match(/^Semifinal (\d+) (Winner|Loser)$/i)
  if (m) return `SF Match ${m[1]} ${m[2]}`
  return name
}
