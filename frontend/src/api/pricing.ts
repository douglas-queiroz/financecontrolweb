import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'

export interface PricingStatus {
  last_price_update: string | null
  last_fx_update: string | null
  has_brapi_key: boolean
  has_twelvedata_key: boolean
  has_coingecko_key: boolean
}

export function usePricingStatus() {
  return useQuery({
    queryKey: ['pricing', 'status'],
    queryFn: () => apiClient.get<PricingStatus>('/pricing/status'),
  })
}

export function useRefreshPricing() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiClient.post<{ status: string }>('/pricing/refresh'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pricing', 'status'] }),
  })
}