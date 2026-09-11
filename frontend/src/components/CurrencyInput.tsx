import { useState, type KeyboardEvent } from 'react'
import { centsToDecimalString, decimalStringToCents, formatBRL } from '../lib/currency'

interface CurrencyInputProps {
  value: string
  onChange: (value: string) => void
  className?: string
  id?: string
}

const ALLOWED_NON_DIGIT_KEYS = ['Tab', 'ArrowLeft', 'ArrowRight', 'Shift']

export function CurrencyInput({ value, onChange, className, id }: CurrencyInputProps) {
  const [cents, setCents] = useState(() => decimalStringToCents(value))
  const [previousValue, setPreviousValue] = useState(value)

  if (value !== previousValue) {
    setPreviousValue(value)
    setCents(decimalStringToCents(value))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key >= '0' && event.key <= '9') {
      event.preventDefault()
      const nextCents = cents * 10 + Number(event.key)
      if (nextCents > Number.MAX_SAFE_INTEGER) return
      setCents(nextCents)
      onChange(centsToDecimalString(nextCents))
      return
    }
    if (event.key === 'Backspace') {
      event.preventDefault()
      const nextCents = Math.floor(cents / 10)
      setCents(nextCents)
      onChange(centsToDecimalString(nextCents))
      return
    }
    if (!ALLOWED_NON_DIGIT_KEYS.includes(event.key) && !(event.ctrlKey || event.metaKey)) {
      event.preventDefault()
    }
  }

  return (
    <input
      id={id}
      inputMode="numeric"
      value={cents === 0 ? '' : formatBRL(cents / 100)}
      onChange={() => {}}
      onKeyDown={handleKeyDown}
      className={className}
    />
  )
}