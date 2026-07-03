import { parseGroupLetters, formatPlaceholder, isPlaceholder, parseMatchNumber } from '../bracketHelpers'

describe('parseMatchNumber', () => {
  it('extracts match number from Match N Winner format', () => {
    expect(parseMatchNumber('Match 73 Winner')).toBe(73)
    expect(parseMatchNumber('Match 87 Winner')).toBe(87)
    expect(parseMatchNumber('Match 88 Winner')).toBe(88)
  })
  it('extracts match number from Match N Loser format (third place)', () => {
    expect(parseMatchNumber('Match 101 Loser')).toBe(101)
    expect(parseMatchNumber('Match 102 Loser')).toBe(102)
  })
  it('extracts match number from legacy R32 M73 format', () => {
    expect(parseMatchNumber('R32 M73 Winner')).toBe(73)
    expect(parseMatchNumber('R32 M88 Winner')).toBe(88)
  })
  it('parses "Round of 32 N Winner/Loser" — relative R32 number offset by 72', () => {
    expect(parseMatchNumber('Round of 32 1 Winner')).toBe(73)
    expect(parseMatchNumber('Round of 32 3 Winner')).toBe(75)
    expect(parseMatchNumber('Round of 32 16 Winner')).toBe(88)
    expect(parseMatchNumber('Round of 32 1 Loser')).toBe(73)
  })
  it('parses "Round of 16 N Winner/Loser" — relative R16 number offset by 88', () => {
    expect(parseMatchNumber('Round of 16 1 Winner')).toBe(89)
    expect(parseMatchNumber('Round of 16 8 Winner')).toBe(96)
  })
  it('parses "Quarterfinal N Winner/Loser" — relative QF number offset by 96', () => {
    expect(parseMatchNumber('Quarterfinal 1 Winner')).toBe(97)
    expect(parseMatchNumber('Quarterfinal 4 Winner')).toBe(100)
  })
  it('parses "Semifinal N Winner/Loser" — relative SF number offset by 100', () => {
    expect(parseMatchNumber('Semifinal 1 Winner')).toBe(101)
    expect(parseMatchNumber('Semifinal 2 Loser')).toBe(102)
  })
  it('returns null for group-based placeholders', () => {
    expect(parseMatchNumber('Group A Winner')).toBeNull()
    expect(parseMatchNumber('Group B Runner-up')).toBeNull()
    expect(parseMatchNumber('3rd Place (A/B/C/D/F)')).toBeNull()
  })
  it('returns null for real team names', () => {
    expect(parseMatchNumber('USA')).toBeNull()
    expect(parseMatchNumber('Brazil')).toBeNull()
  })
})

describe('isPlaceholder', () => {
  it('identifies group winner placeholders', () => {
    expect(isPlaceholder('Group A Winner')).toBe(true)
    expect(isPlaceholder('Group L Runner-up')).toBe(true)
  })
  it('identifies 3rd place placeholders', () => {
    expect(isPlaceholder('3rd Place (A/B/C/D/F)')).toBe(true)
  })
  it('identifies Match N Winner/Loser cross-reference placeholders', () => {
    expect(isPlaceholder('Match 73 Winner')).toBe(true)
    expect(isPlaceholder('Match 101 Loser')).toBe(true)
  })
  it('identifies legacy R32 cross-reference placeholders', () => {
    expect(isPlaceholder('R32 M73 Winner')).toBe(true)
  })
  it('does not flag real team names', () => {
    expect(isPlaceholder('USA')).toBe(false)
    expect(isPlaceholder('Brazil')).toBe(false)
    expect(isPlaceholder('France')).toBe(false)
  })
})

describe('parseGroupLetters', () => {
  it('extracts single group from winner placeholder', () => {
    expect(parseGroupLetters('Group A Winner')).toEqual(['A'])
    expect(parseGroupLetters('Group L Winner')).toEqual(['L'])
  })
  it('extracts single group from runner-up placeholder', () => {
    expect(parseGroupLetters('Group B Runner-up')).toEqual(['B'])
    expect(parseGroupLetters('Group K Runner-up')).toEqual(['K'])
  })
  it('extracts multiple groups from 3rd place placeholder', () => {
    expect(parseGroupLetters('3rd Place (A/B/C/D/F)')).toEqual(['A', 'B', 'C', 'D', 'F'])
    expect(parseGroupLetters('3rd Place (E/H/I/J/K)')).toEqual(['E', 'H', 'I', 'J', 'K'])
  })
  it('returns empty array for Match N cross-references', () => {
    expect(parseGroupLetters('Match 73 Winner')).toEqual([])
    expect(parseGroupLetters('Match 74 Winner')).toEqual([])
  })
  it('returns empty array for real team names', () => {
    expect(parseGroupLetters('USA')).toEqual([])
    expect(parseGroupLetters('Brazil')).toEqual([])
  })
})

describe('formatPlaceholder', () => {
  it('formats group winner as "1st · Group X"', () => {
    expect(formatPlaceholder('Group A Winner')).toBe('1st · Group A')
    expect(formatPlaceholder('Group L Winner')).toBe('1st · Group L')
  })
  it('formats runner-up as "2nd · Group X"', () => {
    expect(formatPlaceholder('Group B Runner-up')).toBe('2nd · Group B')
    expect(formatPlaceholder('Group J Runner-up')).toBe('2nd · Group J')
  })
  it('formats 3rd place as "Best 3rd · A / B / ..." with spaces around slashes', () => {
    expect(formatPlaceholder('3rd Place (A/B/C/D/F)')).toBe('Best 3rd · A / B / C / D / F')
    expect(formatPlaceholder('3rd Place (E/H/I/J/K)')).toBe('Best 3rd · E / H / I / J / K')
  })
  it('returns Match N cross-references unchanged', () => {
    expect(formatPlaceholder('Match 73 Winner')).toBe('Match 73 Winner')
    expect(formatPlaceholder('Match 101 Loser')).toBe('Match 101 Loser')
  })
  it('formats legacy "Round of 32/16" and "Quarterfinal/Semifinal" placeholders', () => {
    expect(formatPlaceholder('Round of 32 1 Winner')).toBe('R32 Match 1 Winner')
    expect(formatPlaceholder('Round of 16 3 Winner')).toBe('R16 Match 3 Winner')
    expect(formatPlaceholder('Quarterfinal 2 Winner')).toBe('QF Match 2 Winner')
    expect(formatPlaceholder('Semifinal 1 Loser')).toBe('SF Match 1 Loser')
  })
  it('is case-insensitive for group letters', () => {
    expect(formatPlaceholder('Group a Winner')).toBe('1st · Group A')
    expect(formatPlaceholder('Group b Runner-up')).toBe('2nd · Group B')
  })
})
