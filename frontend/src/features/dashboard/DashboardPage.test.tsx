import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import * as assetsApi from '../../api/assets'
import * as expensesApi from '../../api/expenses'
import { DashboardPage } from './DashboardPage'

vi.mock('../../api/expenses')
vi.mock('../../api/assets')
vi.mock('./MonthlyTotalsChart', () => ({
  MonthlyTotalsChart: ({ data }: { data: { month: string }[] }) => (
    <div data-testid="monthly-totals-chart">{data.length} points</div>
  ),
}))
vi.mock('./AssetMonthlyTotalsChart', () => ({
  AssetMonthlyTotalsChart: ({ data }: { data: { month: string }[] }) => (
    <div data-testid="asset-monthly-totals-chart">{data.length} points</div>
  ),
}))

function mockAssets(data: unknown) {
  vi.mocked(assetsApi.useAssetMonthlyTotals).mockReturnValue(data as never)
}

function mockExpenses(data: unknown) {
  vi.mocked(expensesApi.useMonthlyTotals).mockReturnValue(data as never)
}

describe('DashboardPage', () => {
  it('shows a skeleton while loading', () => {
    mockExpenses({ data: undefined, isLoading: true, error: null })
    mockAssets({ data: [], isLoading: false, error: null })

    render(<DashboardPage />)

    expect(screen.getByTestId('chart-loading')).toBeInTheDocument()
  })

  it('shows an error message on failure', () => {
    mockExpenses({ data: undefined, isLoading: false, error: new Error('boom') })
    mockAssets({ data: [], isLoading: false, error: null })

    render(<DashboardPage />)

    expect(screen.getByTestId('chart-error')).toHaveTextContent('Failed to load monthly totals.')
  })

  it('passes the 12 months to the chart when data is loaded', () => {
    const months = Array.from({ length: 12 }, (_, i) => `${2025 + Math.floor((i + 9) / 12)}-${String(((i + 9) % 12) + 1).padStart(2, '0')}`)
    mockExpenses({ data: months.map((month) => ({ month, total: '0.00' })), isLoading: false, error: null })
    mockAssets({ data: [], isLoading: false, error: null })

    render(<DashboardPage />)

    expect(screen.getByTestId('monthly-totals-chart')).toHaveTextContent('12 points')
  })

  it('shows an asset skeleton while loading', () => {
    mockExpenses({ data: [], isLoading: false, error: null })
    mockAssets({ data: undefined, isLoading: true, error: null })

    render(<DashboardPage />)

    expect(screen.getByTestId('asset-chart-loading')).toBeInTheDocument()
  })

  it('shows an asset error message on failure', () => {
    mockExpenses({ data: [], isLoading: false, error: null })
    mockAssets({ data: undefined, isLoading: false, error: new Error('boom') })

    render(<DashboardPage />)

    expect(screen.getByTestId('asset-chart-error')).toHaveTextContent('Failed to load asset totals.')
  })

  it('passes the 12 months to the asset chart when data is loaded', () => {
    const months = Array.from({ length: 12 }, (_, i) => `${2025 + Math.floor((i + 9) / 12)}-${String(((i + 9) % 12) + 1).padStart(2, '0')}`)
    mockExpenses({ data: [], isLoading: false, error: null })
    mockAssets({ data: months.map((month) => ({ month, total: '0.00' })), isLoading: false, error: null })

    render(<DashboardPage />)

    expect(screen.getByTestId('asset-monthly-totals-chart')).toHaveTextContent('12 points')
  })
})