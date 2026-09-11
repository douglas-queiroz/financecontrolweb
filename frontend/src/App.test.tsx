import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import * as assetsApi from './api/assets'
import * as expensesApi from './api/expenses'
import App from './App'

vi.mock('./api/expenses')
vi.mock('./api/assets')

describe('App', () => {
  it('renders the app shell with the dashboard at the root route', () => {
    vi.mocked(assetsApi.useAssetMonthlyTotals).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(expensesApi.useMonthlyTotals).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(expensesApi.useUnpaidExpenses).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(expensesApi.usePaidExpenses).mockReturnValue({
      data: { pages: [[]] },
      isLoading: false,
      error: null,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    } as never)
    vi.mocked(expensesApi.useMarkAsPaid).mockReturnValue({ mutate: vi.fn() } as never)
    vi.mocked(expensesApi.useDeleteExpense).mockReturnValue({ mutate: vi.fn() } as never)
    vi.mocked(expensesApi.useReversePayment).mockReturnValue({ mutate: vi.fn() } as never)

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByText('Financial Control')).toBeInTheDocument()
  })
})