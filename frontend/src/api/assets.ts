import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'
import type {
  Asset,
  AssetCreateInput,
  AssetTransaction,
  AssetTransactionInput,
  AssetValueUpdateInput,
} from '../features/assets/types'
import type { MonthlyTotal } from '../features/dashboard/types'

export function useAssets() {
  return useQuery({
    queryKey: ['assets'],
    queryFn: () => apiClient.get<Asset[]>('/assets'),
  })
}

export function useAssetMonthlyTotals() {
  return useQuery({
    queryKey: ['assets', 'monthly-totals'],
    queryFn: () => apiClient.get<MonthlyTotal[]>('/assets/monthly-totals'),
  })
}

function useInvalidateAssets() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['assets'] })
}

export function useCreateAsset() {
  const invalidate = useInvalidateAssets()
  return useMutation({
    mutationFn: (input: AssetCreateInput) => apiClient.post<Asset>('/assets', input),
    onSuccess: invalidate,
  })
}

export function useUpdateAssetName() {
  const invalidate = useInvalidateAssets()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiClient.patch<Asset>(`/assets/${id}`, { name }),
    onSuccess: invalidate,
  })
}

export function useDeleteAsset() {
  const invalidate = useInvalidateAssets()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/assets/${id}`),
    onSuccess: invalidate,
  })
}

export function useAssetTransactions(assetId: string) {
  return useQuery({
    queryKey: ['assets', assetId, 'transactions'],
    queryFn: () => apiClient.get<AssetTransaction[]>(`/assets/${assetId}/transactions`),
    enabled: assetId.length > 0,
  })
}

export function useCreateAssetTransaction(assetId: string) {
  const invalidate = useInvalidateAssets()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AssetTransactionInput) =>
      apiClient.post<AssetTransaction>(`/assets/${assetId}/transactions`, input),
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['assets', assetId, 'transactions'] })
    },
  })
}

export function useUpdateAssetValue(assetId: string) {
  const invalidate = useInvalidateAssets()
  return useMutation({
    mutationFn: (input: AssetValueUpdateInput) =>
      apiClient.post<Asset>(`/assets/${assetId}/value`, input),
    onSuccess: invalidate,
  })
}