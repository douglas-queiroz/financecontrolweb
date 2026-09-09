import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import * as expensesApi from '../../../api/expenses'
import { ExpenseForm } from './ExpenseForm'

vi.mock('../../../api/expenses')

describe('ExpenseForm', () => {
  it('disables save until description, amount, and due date are filled', async () => {
    vi.mocked(expensesApi.useCreateExpense).mockReturnValue({ mutate: vi.fn() } as never)
    vi.mocked(expensesApi.useUpdateExpense).mockReturnValue({ mutate: vi.fn() } as never)

    render(
      <MemoryRouter>
        <ExpenseForm mode="create" />
      </MemoryRouter>,
    )

    const saveButton = screen.getByRole('button', { name: 'Save' })
    expect(saveButton).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Description'), 'Rent')
    await userEvent.type(screen.getByLabelText('Amount'), '100')
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-01-01' } })

    expect(saveButton).toBeEnabled()
  })

  it('requires a frequency once recurring is toggled on', async () => {
    vi.mocked(expensesApi.useCreateExpense).mockReturnValue({ mutate: vi.fn() } as never)
    vi.mocked(expensesApi.useUpdateExpense).mockReturnValue({ mutate: vi.fn() } as never)

    render(
      <MemoryRouter>
        <ExpenseForm mode="create" />
      </MemoryRouter>,
    )

    await userEvent.type(screen.getByLabelText('Description'), 'Subscription')
    await userEvent.type(screen.getByLabelText('Amount'), '10')
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-01-01' } })
    await userEvent.click(screen.getByLabelText('Recurring'))

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    await userEvent.selectOptions(screen.getByLabelText('Frequency'), 'monthly')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('calls createExpense.mutate with the entered values on submit', async () => {
    const mutate = vi.fn()
    vi.mocked(expensesApi.useCreateExpense).mockReturnValue({ mutate } as never)
    vi.mocked(expensesApi.useUpdateExpense).mockReturnValue({ mutate: vi.fn() } as never)

    render(
      <MemoryRouter>
        <ExpenseForm mode="create" />
      </MemoryRouter>,
    )

    await userEvent.type(screen.getByLabelText('Description'), 'Rent')
    await userEvent.type(screen.getByLabelText('Amount'), '100')
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-01-01' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Rent', amount: '100', due_date: '2026-01-01' }),
      expect.anything(),
    )
  })
})