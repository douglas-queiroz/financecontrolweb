import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient, ApiError } from './client'

describe('apiClient', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns parsed JSON on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: '1' }),
      }),
    )

    const result = await apiClient.get<{ id: string }>('/expenses/unpaid')
    expect(result).toEqual({ id: '1' })
  })

  it('throws ApiError with the server detail message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ detail: 'Expense not found' }),
      }),
    )

    await expect(apiClient.get('/expenses/missing')).rejects.toThrow(ApiError)
  })
})