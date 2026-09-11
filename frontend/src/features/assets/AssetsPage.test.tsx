import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import * as assetsApi from '../../api/assets'
import { AssetsPage } from './AssetsPage'

vi.mock('../../api/assets')

const ASSETS = [
  {
    id: '1', name: 'PETR4', category: 'stock' as const, code: 'PETR4', currency: 'BRL' as const,
    quantity: '10', average_cost: '30.00', average_cost_brl: '30.00',
    current_value_brl: '350.00', unrealized_gain_loss_brl: '50.00', created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: '2', name: 'Bitcoin', category: 'bitcoin' as const, code: null, currency: null,
    quantity: '0.01', average_cost: '250000.00', average_cost_brl: '250000.00',
    current_value_brl: '2500.00', unrealized_gain_loss_brl: '0.00', created_at: '2026-01-01T00:00:00Z',
  },
]

describe('AssetsPage', () => {
  it('shows the summed BRL total and each asset row', () => {
    vi.mocked(assetsApi.useAssets).mockReturnValue({ data: ASSETS, isLoading: false, error: null } as never)

    render(
      <MemoryRouter>
        <AssetsPage />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('assets-total')).toHaveTextContent('2.850,00')
    expect(screen.getByTestId('asset-row-1')).toHaveTextContent('PETR4')
    expect(screen.getByTestId('asset-row-2')).toHaveTextContent('Bitcoin')
  })

  it('shows a loading state', () => {
    vi.mocked(assetsApi.useAssets).mockReturnValue({ data: undefined, isLoading: true, error: null } as never)
    render(
      <MemoryRouter>
        <AssetsPage />
      </MemoryRouter>,
    )
    expect(screen.queryByTestId('assets-total')).not.toBeInTheDocument()
  })

  it('shows an error state', () => {
    vi.mocked(assetsApi.useAssets).mockReturnValue({
      data: undefined, isLoading: false, error: new Error('x'),
    } as never)
    render(
      <MemoryRouter>
        <AssetsPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('Failed to load assets.')).toBeInTheDocument()
  })

  it('shows an empty state', () => {
    vi.mocked(assetsApi.useAssets).mockReturnValue({ data: [], isLoading: false, error: null } as never)
    render(
      <MemoryRouter>
        <AssetsPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('No assets yet.')).toBeInTheDocument()
  })
})