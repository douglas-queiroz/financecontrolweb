import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime } from './date'

describe('formatDate', () => {
  it('formats an ISO date as dd/MM/yyyy', () => {
    expect(formatDate('2026-01-01')).toBe('01/01/2026')
  })

  it('pads day and month with zeros', () => {
    expect(formatDate('2026-09-05')).toBe('05/09/2026')
  })

  it('returns an empty string for null, empty, or invalid input', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate(undefined)).toBe('')
    expect(formatDate('')).toBe('')
    expect(formatDate('not-a-date')).toBe('')
  })
})

describe('formatDateTime', () => {
  it('formats an ISO datetime as dd/MM/yyyy HH:mm', () => {
    expect(formatDateTime('2026-01-01T14:05:00')).toBe('01/01/2026 14:05')
  })

  it('pads day, month, hours, and minutes with zeros', () => {
    expect(formatDateTime('2026-01-01T09:05:00')).toBe('01/01/2026 09:05')
  })

  it('returns an empty string for null, empty, or invalid input', () => {
    expect(formatDateTime(null)).toBe('')
    expect(formatDateTime(undefined)).toBe('')
    expect(formatDateTime('')).toBe('')
    expect(formatDateTime('not-a-date')).toBe('')
  })
})