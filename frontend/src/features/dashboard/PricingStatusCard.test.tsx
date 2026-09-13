import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as pricingApi from '../../api/pricing'
import { formatDate } from '../../lib/date'
import { PricingStatusCard } from './PricingStatusCard'

vi.mock('../../api/pricing')

const base: pricingApi.PricingStatus = {
  last_price_update: null,
  last_fx_update: null,
  has_brapi_key: false,
  has_twelvedata_key: false,
  has_coingecko_key: false,
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function mockStatus(overrides: Partial<pricingApi.PricingStatus>) {
  vi.mocked(pricingApi.usePricingStatus).mockReturnValue({
    data: { ...base, ...overrides },
    isLoading: false,
    error: null,
  } as never)
  vi.mocked(pricingApi.useRefreshPricing).mockReturnValue({ mutate: vi.fn(), isPending: false } as never)
}

describe('PricingStatusCard', () => {
  beforeEach(() => mockStatus({}))

  it('shows Never when no market updates exist', () => {
    render(<PricingStatusCard />)
    expect(screen.getByTestId('pricing-last-price')).toHaveTextContent('Never')
    expect(screen.getByTestId('pricing-last-fx')).toHaveTextContent('Never')
  })

  it('shows the last update dates in dd/MM/yyyy', () => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    mockStatus({ last_price_update: iso(today), last_fx_update: iso(yesterday) })

    render(<PricingStatusCard />)

    expect(screen.getByTestId('pricing-last-price')).toHaveTextContent(formatDate(iso(today)))
    expect(screen.getByTestId('pricing-last-fx')).toHaveTextContent(formatDate(iso(yesterday)))
  })

  it('shows a hint when no provider keys are configured', () => {
    render(<PricingStatusCard />)
    expect(screen.getByTestId('pricing-keys-hint')).toBeInTheDocument()
  })

  it('hides the keys hint when a provider key is configured', () => {
    mockStatus({ has_twelvedata_key: true })
    render(<PricingStatusCard />)
    expect(screen.queryByTestId('pricing-keys-hint')).not.toBeInTheDocument()
  })

  it('triggers a refresh when the button is clicked', () => {
    const mutate = vi.fn()
    vi.mocked(pricingApi.useRefreshPricing).mockReturnValue({ mutate, isPending: false } as never)

    render(<PricingStatusCard />)

    screen.getByTestId('pricing-refresh').click()
    expect(mutate).toHaveBeenCalled()
  })
})