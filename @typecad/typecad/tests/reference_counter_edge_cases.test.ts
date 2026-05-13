import { describe, it, expect, beforeEach } from 'vitest'
import { ReferenceCounter } from '../src/reference_counter.js'

describe('ReferenceCounter edge cases', () => {
  let counter: ReferenceCounter

  beforeEach(() => {
    counter = new ReferenceCounter()
  })

  it('should reject references without a numeric suffix', () => {
    // The regex /^[#]?[a-zA-Z]+\d+$/ requires digits after the prefix
    // A reference like "R" (no number) would fail the regex match
    // setReference returns false for invalid references
    expect(counter.setReference('R')).toBe(false)
  })

  it('should handle # prefixed references', () => {
    // The regex /^[#]?[a-zA-Z]+\d+$/ allows an optional # prefix
    expect(counter.setReference('#R1')).toBe(true)
    expect(counter.getNextReference('#R')).toBe('#R2')
  })

  it('should track references with different prefixes independently', () => {
    expect(counter.getNextReference('R')).toBe('R1')
    expect(counter.getNextReference('R')).toBe('R2')
    expect(counter.getNextReference('C')).toBe('C1')
    expect(counter.getNextReference('C')).toBe('C2')
    expect(counter.getNextReference('R')).toBe('R3')
  })

  it('should allow setReference then getNextReference for same prefix case', () => {
    counter.setReference('LED1')
    expect(counter.getNextReference('LED')).toBe('LED2')
  })

  it('should skip references marked as used via setReference', () => {
    counter.setReference('R5')
    counter.setReference('R6')
    counter.setReference('R7')
    // With matching case, getNextReference('R') should get R1 since
    // setReference stores under lowercase 'r' key
    expect(counter.getNextReference('R')).toBe('R1')
    // But using lowercase matches the setReference key
    expect(counter.getNextReference('r')).toBe('r8')
  })

  it('should handle reset clearing all state', () => {
    counter.setReference('R1')
    counter.setReference('C1')
    counter.getNextReference('U')

    counter.reset()

    // All references should be available again
    expect(counter.getNextReference('R')).toBe('R1')
    expect(counter.getNextReference('C')).toBe('C1')
    expect(counter.getNextReference('U')).toBe('U1')
  })

  it('should reject duplicate setReference calls', () => {
    expect(counter.setReference('R1')).toBe(true)
    expect(counter.setReference('R1')).toBe(false)
    expect(counter.setReference('R1')).toBe(false)
  })

  it('should handle long numeric suffixes', () => {
    expect(counter.setReference('R999')).toBe(true)
    expect(counter.getNextReference('r')).toBe('r1000')
  })

  it('should handle three-character prefixes', () => {
    expect(counter.getNextReference('LED')).toBe('LED1')
    expect(counter.getNextReference('LED')).toBe('LED2')
    expect(counter.getNextReference('Q')).toBe('Q1')
  })

  it('should handle mixed case getNextReference calls independently', () => {
    // 'R' and 'r' are different keys for getNextReference
    expect(counter.getNextReference('R')).toBe('R1')
    expect(counter.getNextReference('r')).toBe('r1')
    expect(counter.getNextReference('R')).toBe('R2')
    expect(counter.getNextReference('r')).toBe('r2')
  })
})
