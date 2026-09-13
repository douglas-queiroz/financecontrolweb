import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import * as expensesApi from '../../api/expenses'
import { ExpensesPage } from './ExpensesPage'

vi.mock('../../api/expenses')

function mockEmptyExpenses() {
  vi.mocked(expensesApi.useExpensesByMonth).mockReturnValue({ data: [], isLoading: false, error: null } as never)
  vi.mocked(expensesApi.useMarkAsPaid).mockReturnValue({ mutate: vi.fn() } as never)
  vi.mocked(expensesApi.useReversePayment).mockReturnValue({ mutate: vi.fn() } as never)
  vi.mocked(expensesApi.useDeleteExpense).mockReturnValue({ mutate: vi.fn() } as never)
}

describe('ExpensesPage', () => {
  it('moves to the next month when the next button is clicked', () => {
    mockEmptyExpenses()

    render(
      <MemoryRouter>
        <ExpensesPage />
      </MemoryRouter>,
    )

    const [initialYear, initialMonth] = vi.mocked(expensesApi.useExpensesByMonth).mock.calls[0]

    fireEvent.click(screen.getByTestId('month-nav-next'))

    const nextCall = vi.mocked(expensesApi.useExpensesByMonth).mock.calls.at(-1)
    const expected = initialMonth === 12 ? [initialYear + 1, 1] : [initialYear, initialMonth + 1]
    expect(nextCall).toEqual(expected)
  })

  it('moves to the previous month when the previous button is clicked', () => {
    mockEmptyExpenses()

    render(
      <MemoryRouter>
        <ExpensesPage />
      </MemoryRouter>,
    )

    const [initialYear, initialMonth] = vi.mocked(expensesApi.useExpensesByMonth).mock.calls[0]

    fireEvent.click(screen.getByTestId('month-nav-previous'))

    const prevCall = vi.mocked(expensesApi.useExpensesByMonth).mock.calls.at(-1)
    const expected = initialMonth === 1 ? [initialYear - 1, 12] : [initialYear, initialMonth - 1]
    expect(prevCall).toEqual(expected)
  })
})