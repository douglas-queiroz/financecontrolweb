import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import {
  useAssetMonthlyTotals,
  useAssets,
  useCreateAsset,
  useCreateAssetTransaction,
} from './assets'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useAssets', () => {
  it('fetches the asset list', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([{ id: '1', name: 'PETR4' }])

    const { result } = renderHook(() => useAssets(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiClient.get).toHaveBeenCalledWith('/assets')
  })
})

describe('useAssetMonthlyTotals', () => {
  it('fetches the trailing 12-month totals', async () => {
    vi.mocked(apiClient.get).mockResolvedValue([{ month: '2026-09', total: '260954.32' }])

    const { result } = renderHook(() => useAssetMonthlyTotals(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiClient.get).toHaveBeenCalledWith('/assets/monthly-totals')
  })
})

describe('useCreateAsset', () => {
  it('posts the new asset', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ id: '1' })

    const { result } = renderHook(() => useCreateAsset(), { wrapper: createWrapper() })

    result.current.mutate({
      name: 'PETR4', category: 'stock', code: 'PETR4', currency: 'BRL',
      quantity: '10', unit_price: '30.00', date: '2026-01-01', fx_rate_to_brl: null,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiClient.post).toHaveBeenCalledWith('/assets', expect.objectContaining({ name: 'PETR4' }))
  })
})

describe('useCreateAssetTransaction', () => {
  it('posts a transaction for the given asset', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ id: 't1' })

    const { result } = renderHook(() => useCreateAssetTransaction('a1'), { wrapper: createWrapper() })

    result.current.mutate({
      type: 'sell', quantity: '4', unit_price: '40.00', date: '2026-02-01', fx_rate_to_brl: null,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiClient.post).toHaveBeenCalledWith(
      '/assets/a1/transactions',
      expect.objectContaining({ type: 'sell' }),
    )
  })
})