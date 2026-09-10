import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import * as expensesApi from '../../../api/expenses'
import { UnpaidExpensesList } from './UnpaidExpensesList'

vi.mock('../../../api/expenses')

describe('UnpaidExpensesList', () => {
  it('marks overdue expenses with a status chip and shows nothing for future bills', () => {
    vi.mocked(expensesApi.useUnpaidExpenses).mockReturnValue({
      data: [
        { id: '1', description: 'Overdue rent', amount: '10', due_date: '2020-01-01' },
        { id: '2', description: 'Future bill', amount: '20', due_date: '2999-01-01' },
      ],
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(expensesApi.useMarkAsPaid).mockReturnValue({ mutate: vi.fn() } as never)
    vi.mocked(expensesApi.useDeleteExpense).mockReturnValue({ mutate: vi.fn() } as never)

    render(
      <MemoryRouter>
        <UnpaidExpensesList />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('status-chip-1')).toHaveTextContent('Overdue')
    expect(screen.queryByTestId('status-chip-2')).not.toBeInTheDocument()
  })
})