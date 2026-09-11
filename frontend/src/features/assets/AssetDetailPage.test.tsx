import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import * as assetsApi from '../../api/assets'
import { AssetDetailPage } from './AssetDetailPage'
import type { Asset } from './types'

vi.mock('../../api/assets')

const STOCK: Asset = {
  id: '1', name: 'PETR4', category: 'stock', code: 'PETR4', currency: 'BRL',
  quantity: '10', average_cost: '30.00', average_cost_brl: '30.00',
  current_value_brl: '350.00', unrealized_gain_loss_brl: '50.00', created_at: '2026-01-01T00:00:00Z',
}

const BOND: Asset = { ...STOCK, id: '2', category: 'bond', code: null }

function renderDetail(id: string, asset: Asset) {
  vi.mocked(assetsApi.useAssets).mockReturnValue({ data: [asset], isLoading: false, error: null } as never)
  vi.mocked(assetsApi.useAssetTransactions).mockReturnValue({
    data: [
      {
        id: 't1', asset_id: id, type: 'buy', quantity: '10', unit_price: '30.00',
        total_amount: '300.00', realized_gain_loss_brl: null, date: '2026-01-01',
        created_at: '2026-01-01T00:00:00Z',
      },
    ],
    isLoading: false,
    error: null,
  } as never)
  vi.mocked(assetsApi.useCreateAssetTransaction).mockReturnValue({ mutate: vi.fn() } as never)
  vi.mocked(assetsApi.useUpdateAssetValue).mockReturnValue({ mutate: vi.fn() } as never)

  return render(
    <MemoryRouter initialEntries={[`/assets/${id}`]}>
      <Routes>
        <Route path="/assets/:id" element={<AssetDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AssetDetailPage', () => {
  it('shows the asset stats and transaction history', () => {
    renderDetail('1', STOCK)
    expect(screen.getByText('PETR4')).toBeInTheDocument()
    expect(screen.getByTestId('unrealized-gain-loss')).toHaveTextContent('50,00')
    expect(screen.getByTestId('transaction-t1')).toBeInTheDocument()
  })

  it('toggles the Buy/Sell form', async () => {
    renderDetail('1', STOCK)
    expect(screen.queryByRole('button', { name: 'Buy' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Buy / Sell' }))
    expect(screen.getByRole('button', { name: 'Buy' })).toBeInTheDocument()
  })

  it('shows an Update value action only for bonds', () => {
    renderDetail('2', BOND)
    expect(screen.getByRole('button', { name: 'Update value' })).toBeInTheDocument()
  })

  it('hides the Update value action for non-bonds', () => {
    renderDetail('1', STOCK)
    expect(screen.queryByRole('button', { name: 'Update value' })).not.toBeInTheDocument()
  })
})