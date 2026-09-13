import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import * as expensesApi from '../../../api/expenses'
import { ExpensesList } from './ExpensesList'

vi.mock('../../../api/expenses')

function mockExpenses(data: unknown) {
  vi.mocked(expensesApi.useExpensesByMonth).mockReturnValue({ data, isLoading: false, error: null } as never)
  vi.mocked(expensesApi.useMarkAsPaid).mockReturnValue({ mutate: vi.fn() } as never)
  vi.mocked(expensesApi.useReversePayment).mockReturnValue({ mutate: vi.fn() } as never)
  vi.mocked(expensesApi.useDeleteExpense).mockReturnValue({ mutate: vi.fn() } as never)
}

describe('ExpensesList', () => {
  it('renders rows in the order the API returns them', () => {
    mockExpenses([
      { id: '1', description: 'Unpaid bill', amount: '10', due_date: '2999-01-01', paid_at: null },
      { id: '2', description: 'Paid bill', amount: '20', due_date: '2026-01-01', paid_at: '2026-01-02T00:00:00Z' },
    ])

    render(
      <MemoryRouter>
        <ExpensesList year={2026} month={1} />
      </MemoryRouter>,
    )

    const rows = screen.getAllByText(/bill/i)
    expect(rows[0]).toHaveTextContent('Unpaid bill')
    expect(rows[1]).toHaveTextContent('Paid bill')
  })

  it('shows Mark as Paid for unpaid rows and Reverse Payment for paid rows', () => {
    mockExpenses([
      { id: '1', description: 'Unpaid bill', amount: '10', due_date: '2999-01-01', paid_at: null },
      { id: '2', description: 'Paid bill', amount: '20', due_date: '2026-01-01', paid_at: '2026-01-02T00:00:00Z' },
    ])

    render(
      <MemoryRouter>
        <ExpensesList year={2026} month={1} />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('primary-action-1')).toHaveAttribute('aria-label', 'Mark as Paid')
    expect(screen.getByTestId('primary-action-2')).toHaveAttribute('aria-label', 'Reverse Payment')
  })

  it('shows an empty state when there are no expenses this month', () => {
    mockExpenses([])

    render(
      <MemoryRouter>
        <ExpensesList year={2026} month={1} />
      </MemoryRouter>,
    )

    expect(screen.getByText(/no expenses this month/i)).toBeInTheDocument()
  })
})