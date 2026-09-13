import { describe, expect, it } from 'vitest'
import { expenseStatus } from './expenseStatus'

describe('expenseStatus', () => {
  const today = new Date('2026-01-10T00:00:00')

  it('returns overdue for dates before today', () => {
    expect(expenseStatus('2026-01-09', today)).toBe('overdue')
  })

  it('returns due-soon for dates within 3 days', () => {
    expect(expenseStatus('2026-01-13', today)).toBe('due-soon')
  })

  it('returns normal for dates further than 3 days away', () => {
    expect(expenseStatus('2026-01-20', today)).toBe('normal')
  })
})