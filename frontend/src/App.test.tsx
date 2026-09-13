import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import * as assetsApi from './api/assets'
import * as expensesApi from './api/expenses'
import * as pricingApi from './api/pricing'
import App from './App'

vi.mock('./api/expenses')
vi.mock('./api/assets')
vi.mock('./api/pricing')

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
    vi.mocked(pricingApi.usePricingStatus).mockReturnValue({
      data: {
        last_price_update: null,
        last_fx_update: null,
        has_brapi_key: false,
        has_twelvedata_key: false,
        has_coingecko_key: false,
      },
      isLoading: false,
      error: null,
    } as never)
    vi.mocked(pricingApi.useRefreshPricing).mockReturnValue({ mutate: vi.fn(), isPending: false } as never)

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByText('Financial Control')).toBeInTheDocument()
  })
})