import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import * as assetsApi from '../../api/assets'
import { AssetForm } from './AssetForm'

vi.mock('../../api/assets')

function renderForm() {
  vi.mocked(assetsApi.useCreateAsset).mockReturnValue({ mutate: vi.fn() } as never)
  return render(
    <MemoryRouter>
      <AssetForm />
    </MemoryRouter>,
  )
}

describe('AssetForm', () => {
  it('shows Code and Currency fields for a stock', () => {
    renderForm()
    expect(screen.getByLabelText('Code')).toBeInTheDocument()
    expect(screen.getByLabelText('Currency')).toBeInTheDocument()
  })

  it('hides Code but shows Currency for a bond', async () => {
    renderForm()
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'bond')
    expect(screen.queryByLabelText('Code')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Currency')).toBeInTheDocument()
  })

  it('hides both Code and Currency for bitcoin', async () => {
    renderForm()
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'bitcoin')
    expect(screen.queryByLabelText('Code')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Currency')).not.toBeInTheDocument()
  })

  it('disables save until name, quantity, unit price, and date are filled', async () => {
    renderForm()
    const saveButton = screen.getByRole('button', { name: 'Save' })
    expect(saveButton).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Name'), 'PETR4')
    await userEvent.type(screen.getByLabelText('Code'), 'PETR4')
    await userEvent.type(screen.getByLabelText('Quantity'), '10')
    await userEvent.type(screen.getByLabelText(/Unit price/), '30')
    const dateInput = screen.getByLabelText('Date')
    await userEvent.type(dateInput, '2026-01-01')

    expect(saveButton).toBeEnabled()
  })
})