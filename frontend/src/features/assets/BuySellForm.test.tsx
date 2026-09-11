import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import * as assetsApi from '../../api/assets'
import { BuySellForm } from './BuySellForm'
import type { Asset } from './types'

vi.mock('../../api/assets')

const STOCK_BRL: Asset = {
  id: '1', name: 'PETR4', category: 'stock', code: 'PETR4', currency: 'BRL',
  quantity: '10', average_cost: '30.00', average_cost_brl: '30.00',
  current_value_brl: '300.00', unrealized_gain_loss_brl: '0.00', created_at: '2026-01-01T00:00:00Z',
}

const STOCK_USD: Asset = { ...STOCK_BRL, id: '2', currency: 'USD' }

describe('BuySellForm', () => {
  it('shows an FX rate field for a non-BRL asset but not a BRL one', () => {
    const mutate = vi.fn()
    vi.mocked(assetsApi.useCreateAssetTransaction).mockReturnValue({ mutate } as never)

    const { rerender } = render(<BuySellForm asset={STOCK_BRL} onDone={vi.fn()} />)
    expect(screen.queryByLabelText(/BRL rate/)).not.toBeInTheDocument()

    rerender(<BuySellForm asset={STOCK_USD} onDone={vi.fn()} />)
    expect(screen.getByLabelText(/BRL rate/)).toBeInTheDocument()
  })

  it('submits a sell transaction with the entered fields', async () => {
    const mutate = vi.fn((_input, options) => options?.onSuccess?.())
    vi.mocked(assetsApi.useCreateAssetTransaction).mockReturnValue({ mutate } as never)
    const onDone = vi.fn()

    render(<BuySellForm asset={STOCK_BRL} onDone={onDone} />)

    await userEvent.click(screen.getByRole('button', { name: 'Sell' }))
    await userEvent.type(screen.getByLabelText('Quantity'), '4')
    await userEvent.type(screen.getByLabelText(/Unit price/), '40')
    await userEvent.type(screen.getByLabelText('Date'), '2026-02-01')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sell', quantity: '4', date: '2026-02-01' }),
      expect.anything(),
    )
    expect(onDone).toHaveBeenCalled()
  })
})