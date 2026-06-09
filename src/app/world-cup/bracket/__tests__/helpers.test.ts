import { parseGroupLetters, formatPlaceholder, isPlaceholder } from '../bracketHelpers'

describe('isPlaceholder', () => {
  it('identifies group winner placeholders', () => {
    expect(isPlaceholder('Group A Winner')).toBe(true)
    expect(isPlaceholder('Group L Runner-up')).toBe(true)
  })
  it('identifies 3rd place placeholders', () => {
    expect(isPlaceholder('3rd Place (A/B/C/D/F)')).toBe(true)
  })
  it('identifies R32 cross-reference placeholders', () => {
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
  it('returns empty array for R32 cross-references', () => {
    expect(parseGroupLetters('R32 M73 Winner')).toEqual([])
    expect(parseGroupLetters('R32 M74 Winner')).toEqual([])
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
  it('returns R32 cross-references unchanged', () => {
    expect(formatPlaceholder('R32 M73 Winner')).toBe('R32 M73 Winner')
  })
  it('is case-insensitive for group letters', () => {
    expect(formatPlaceholder('Group a Winner')).toBe('1st · Group A')
    expect(formatPlaceholder('Group b Runner-up')).toBe('2nd · Group B')
  })
})
