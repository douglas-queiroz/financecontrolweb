import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as expensesApi from '../../../api/expenses'
import { PaidExpensesList } from './PaidExpensesList'

vi.mock('../../../api/expenses')

class MockIntersectionObserver {
  callback: IntersectionObserverCallback
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
  }
  observe() {}
  disconnect() {}
}

describe('PaidExpensesList', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
  })

  it('renders paid expenses from all loaded pages', () => {
    vi.mocked(expensesApi.usePaidExpenses).mockReturnValue({
      data: { pages: [[{ id: '1', description: 'Rent', amount: '10', due_date: '2026-01-01' }]] },
      isLoading: false,
      error: null,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    } as never)
    vi.mocked(expensesApi.useReversePayment).mockReturnValue({ mutate: vi.fn() } as never)
    vi.mocked(expensesApi.useDeleteExpense).mockReturnValue({ mutate: vi.fn() } as never)

    render(
      <MemoryRouter>
        <PaidExpensesList />
      </MemoryRouter>,
    )

    expect(screen.getByText('Rent')).toBeInTheDocument()
  })

  it('fetches the next page when the sentinel intersects', () => {
    const fetchNextPage = vi.fn()
    let capturedCallback: IntersectionObserverCallback | undefined

    class CapturingObserver extends MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        super(callback)
        capturedCallback = callback
      }
    }
    vi.stubGlobal('IntersectionObserver', CapturingObserver)

    vi.mocked(expensesApi.usePaidExpenses).mockReturnValue({
      data: { pages: [[]] },
      isLoading: false,
      error: null,
      fetchNextPage,
      hasNextPage: true,
      isFetchingNextPage: false,
    } as never)
    vi.mocked(expensesApi.useReversePayment).mockReturnValue({ mutate: vi.fn() } as never)
    vi.mocked(expensesApi.useDeleteExpense).mockReturnValue({ mutate: vi.fn() } as never)

    render(
      <MemoryRouter>
        <PaidExpensesList />
      </MemoryRouter>,
    )

    capturedCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    expect(fetchNextPage).toHaveBeenCalled()
  })
})