import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Expense } from '../types'
import { ExpenseRow } from './ExpenseRow'

const baseExpense: Expense = {
  id: '1',
  description: 'Rent',
  amount: '100.00',
  due_date: '2026-01-01',
  paid_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  is_recurring: false,
  recurrence_frequency: null,
  recurrence_interval: 1,
  recurrence_end_date: null,
}

describe('ExpenseRow', () => {
  it('shows an overdue chip for an unpaid overdue expense', () => {
    render(
      <ExpenseRow
        expense={baseExpense}
        status="overdue"
        primaryActionLabel="Mark as Paid"
        onPrimaryAction={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByTestId('status-chip-1')).toHaveTextContent('Overdue')
  })

  it('shows a Paid chip instead of a status chip for a paid expense', () => {
    render(
      <ExpenseRow
        expense={{ ...baseExpense, paid_at: '2026-01-01T00:00:00Z' }}
        status="overdue"
        primaryActionLabel="Reverse Payment"
        onPrimaryAction={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByTestId('status-chip-1')).toHaveTextContent('Paid')
  })

  it('calls onPrimaryAction when the primary action button is clicked', () => {
    const onPrimaryAction = vi.fn()
    render(
      <ExpenseRow
        expense={baseExpense}
        primaryActionLabel="Mark as Paid"
        onPrimaryAction={onPrimaryAction}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    screen.getByTestId('primary-action-1').click()
    expect(onPrimaryAction).toHaveBeenCalled()
  })
})