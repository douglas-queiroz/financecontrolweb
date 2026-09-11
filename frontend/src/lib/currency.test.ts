import { describe, expect, it } from 'vitest'
import { centsToDecimalString, decimalStringToCents, formatBRL } from './currency'

function normalizeSpaces(value: string): string {
  return value.replace(/\u00A0/g, ' ')
}

describe('formatBRL', () => {
  it('formats a whole number with the BRL symbol and two decimals', () => {
    expect(normalizeSpaces(formatBRL(0))).toBe('R$ 0,00')
  })

  it('uses a period as the thousands separator and comma as the decimal separator', () => {
    expect(normalizeSpaces(formatBRL('1234567.89'))).toBe('R$ 1.234.567,89')
  })

  it('accepts a plain number', () => {
    expect(normalizeSpaces(formatBRL(1234.5))).toBe('R$ 1.234,50')
  })
})

describe('centsToDecimalString / decimalStringToCents', () => {
  it('round-trips cents through a canonical decimal string', () => {
    expect(centsToDecimalString(123456)).toBe('1234.56')
    expect(decimalStringToCents('1234.56')).toBe(123456)
  })

  it('pads single-digit cents with a leading zero', () => {
    expect(centsToDecimalString(105)).toBe('1.05')
  })

  it('treats an empty or invalid string as zero cents', () => {
    expect(decimalStringToCents('')).toBe(0)
    expect(decimalStringToCents('not a number')).toBe(0)
  })
})