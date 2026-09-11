import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'
import type { Expense, ExpenseInput } from '../features/expenses/types'
import type { MonthlyTotal } from '../features/dashboard/types'

const PAGE_SIZE = 20

export function useMonthlyTotals() {
  return useQuery({
    queryKey: ['expenses', 'monthly-totals'],
    queryFn: () => apiClient.get<MonthlyTotal[]>('/expenses/monthly-totals'),
  })
}

export function useUnpaidExpenses() {
  return useQuery({
    queryKey: ['expenses', 'unpaid'],
    queryFn: () => apiClient.get<Expense[]>('/expenses/unpaid?limit=20'),
  })
}

export function usePaidExpenses() {
  return useInfiniteQuery({
    queryKey: ['expenses', 'paid'],
    queryFn: ({ pageParam }) =>
      apiClient.get<Expense[]>(`/expenses/paid?offset=${pageParam}&limit=${PAGE_SIZE}`),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
  })
}

function useInvalidateExpenses() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['expenses'] })
}

export function useCreateExpense() {
  const invalidate = useInvalidateExpenses()
  return useMutation({
    mutationFn: (input: ExpenseInput) => apiClient.post<Expense>('/expenses', input),
    onSuccess: invalidate,
  })
}

export function useUpdateExpense() {
  const invalidate = useInvalidateExpenses()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ExpenseInput }) =>
      apiClient.put<Expense>(`/expenses/${id}`, input),
    onSuccess: invalidate,
  })
}

export function useDeleteExpense() {
  const invalidate = useInvalidateExpenses()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/expenses/${id}`),
    onSuccess: invalidate,
  })
}

export function useMarkAsPaid() {
  const invalidate = useInvalidateExpenses()
  return useMutation({
    mutationFn: (id: string) => apiClient.post<Expense>(`/expenses/${id}/mark-paid`),
    onSuccess: invalidate,
  })
}

export function useReversePayment() {
  const invalidate = useInvalidateExpenses()
  return useMutation({
    mutationFn: (id: string) => apiClient.post<Expense>(`/expenses/${id}/reverse-payment`),
    onSuccess: invalidate,
  })
}