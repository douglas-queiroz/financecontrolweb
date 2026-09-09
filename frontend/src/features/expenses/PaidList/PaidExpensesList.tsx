import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDeleteExpense, usePaidExpenses, useReversePayment } from '../../../api/expenses'
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

  if (isLoading) return <p className="p-4">Loading…</p>
  if (error) return <p className="p-4 text-red-600">Failed to load expenses.</p>

  const expenses = data?.pages.flat() ?? []

  return (
    <div>
      {expenses.map((expense) => (
        <ExpenseRow
          key={expense.id}
          expense={expense}
          primaryActionLabel="Reverse Payment"
          onPrimaryAction={() => reversePayment.mutate(expense.id)}
          onEdit={() => navigate(`/expenses/${expense.id}/edit`)}
          onDelete={() => {
            if (window.confirm('Delete this expense?')) {
              deleteExpense.mutate(expense.id)
            }
          }}
        />
      ))}
      <div ref={sentinelRef} />
      {isFetchingNextPage && <p className="p-3 text-gray-500">Loading more…</p>}
    </div>
  )
}