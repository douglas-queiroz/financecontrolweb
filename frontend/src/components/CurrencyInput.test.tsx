import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CurrencyInput } from './CurrencyInput'

function ControlledWrapper() {
  const [value, setValue] = useState('0.00')
  return <CurrencyInput value={value} onChange={setValue} />
}

describe('CurrencyInput', () => {
  it('builds a cents-first masked display as the user types digits', async () => {
    render(<ControlledWrapper />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    await userEvent.type(input, '15000')
    expect(input.value).toContain('150,00')
  })

  it('emits the canonical decimal string via onChange for each keystroke', async () => {
    const handleChange = vi.fn()
    render(<CurrencyInput value="0.00" onChange={handleChange} />)
    const input = screen.getByRole('textbox')
    await userEvent.type(input, '150')
    expect(handleChange).toHaveBeenLastCalledWith('1.50')
  })

  it('removes the last digit on backspace', async () => {
    const handleChange = vi.fn()
    render(<CurrencyInput value="0.00" onChange={handleChange} />)
    const input = screen.getByRole('textbox')
    await userEvent.type(input, '150')
    await userEvent.type(input, '{backspace}')
    expect(handleChange).toHaveBeenLastCalledWith('0.15')
  })

  it('resyncs the displayed value when the value prop changes externally', () => {
    const { rerender } = render(<CurrencyInput value="10.00" onChange={() => {}} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toContain('10,00')
    rerender(<CurrencyInput value="25.50" onChange={() => {}} />)
    expect(input.value).toContain('25,50')
  })

  it('shows an empty field when the value is zero', () => {
    render(<CurrencyInput value="0.00" onChange={() => {}} />)
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('')
  })
})