import { act, render, screen } from '@testing-library/react'
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
  const updateName = { mutate: vi.fn() }
  const deleteAsset = { mutate: vi.fn() }
  vi.mocked(assetsApi.useUpdateAssetName).mockReturnValue(updateName as never)
  vi.mocked(assetsApi.useDeleteAsset).mockReturnValue(deleteAsset as never)

  const view = render(
    <MemoryRouter initialEntries={[`/assets/${id}`]}>
      <Routes>
        <Route path="/assets/:id" element={<AssetDetailPage />} />
        <Route path="/assets" element={<p>Assets home</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return { ...view, updateName, deleteAsset }
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

  it('reveals a rename form pre-filled with the current name and saves via the mutation', async () => {
    const { updateName } = renderDetail('1', STOCK)
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))

    const input = screen.getByLabelText('Name')
    expect(input).toHaveValue('PETR4')

    await userEvent.clear(input)
    await userEvent.type(input, 'PETR4 renamed')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(updateName.mutate).toHaveBeenCalledWith(
      { id: '1', name: 'PETR4 renamed' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('hides the rename form after a successful save', async () => {
    const { updateName } = renderDetail('1', STOCK)

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    const options = updateName.mutate.mock.calls[0][1]
    act(() => options.onSuccess())

    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
  })

  it('disables saving when the name is emptied', async () => {
    renderDetail('1', STOCK)

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await userEvent.clear(screen.getByLabelText('Name'))

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('deletes the asset after confirmation and navigates to the assets list', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { deleteAsset } = renderDetail('1', STOCK)

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(confirmSpy).toHaveBeenCalledWith('Delete this asset?')
    expect(deleteAsset.mutate).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )

    const options = deleteAsset.mutate.mock.calls[0][1]
    act(() => options.onSuccess())

    expect(await screen.findByText('Assets home')).toBeInTheDocument()
    confirmSpy.mockRestore()
  })

  it('does not delete when the confirmation is declined', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { deleteAsset } = renderDetail('1', STOCK)

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(deleteAsset.mutate).not.toHaveBeenCalled()
    expect(screen.getByText('PETR4')).toBeInTheDocument()
    confirmSpy.mockRestore()
  })
})