import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { useCreateExpense, useUnpaidExpenses } from './expenses'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useUnpaidExpenses', () => {
  it('fetches the unpaid list', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([{ id: '1', description: 'Rent' }])

    const { result } = renderHook(() => useUnpaidExpenses(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiClient.get).toHaveBeenCalledWith('/expenses/unpaid?limit=20')
    expect(result.current.data).toEqual([{ id: '1', description: 'Rent' }])
  })
})

describe('useCreateExpense', () => {
  it('posts the new expense', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ id: '1' })

    const { result } = renderHook(() => useCreateExpense(), { wrapper: createWrapper() })

    result.current.mutate({
      description: 'Rent',
      amount: '10',
      due_date: '2026-01-01',
      is_recurring: false,
      recurrence_frequency: null,
      recurrence_interval: 1,
      recurrence_end_date: null,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiClient.post).toHaveBeenCalledWith('/expenses', expect.objectContaining({ description: 'Rent' }))
  })
})