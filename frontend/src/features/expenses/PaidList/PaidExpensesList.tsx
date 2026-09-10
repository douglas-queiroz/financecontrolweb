import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDeleteExpense, usePaidExpenses, useReversePayment } from '../../../api/expenses'
import { SkeletonRow } from '../../../components/SkeletonRow'
import { ExpenseRow } from '../shared/ExpenseRow'

export function PaidExpensesList() {
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = usePaidExpenses()
  const reversePayment = useReversePayment()
  const deleteExpense = useDeleteExpense()
  const navigate = useNavigate()
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasNextPage) return

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        fetchNextPage()
      }
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasNextPage, fetchNextPage])

  if (isLoading) {
    return (
      <div className="space-y-3">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    )
  }
  if (error) return <p className="p-6 text-center text-danger-600">Failed to load expenses.</p>

  const expenses = data?.pages.flat() ?? []

  return (
    <div className="space-y-3">
      {expenses.length === 0 ? (
        <p className="p-10 text-center text-gray-500">No paid expenses yet</p>
      ) : (
        expenses.map((expense) => (
          <ExpenseRow
            key={expense.id}
            expense={expense}
            primaryActionLabel="Reverse Payment"
            primaryActionIcon="restore-icon"
            onPrimaryAction={() => reversePayment.mutate(expense.id)}
            onEdit={() => navigate(`/expenses/${expense.id}/edit`)}
            onDelete={() => {
              if (window.confirm('Delete this expense?')) {
                deleteExpense.mutate(expense.id)
              }
            }}
          />
        ))
      )}
      <div ref={sentinelRef} />
      {isFetchingNextPage && (
        <div className="space-y-3">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      )}
    </div>
  )
}