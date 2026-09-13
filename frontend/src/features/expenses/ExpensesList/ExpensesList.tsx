import { useNavigate } from 'react-router-dom'
import { useDeleteExpense, useExpensesByMonth, useMarkAsPaid, useReversePayment } from '../../../api/expenses'
import { SkeletonRow } from '../../../components/SkeletonRow'
import { expenseStatus } from '../shared/expenseStatus'
import { ExpenseRow } from '../shared/ExpenseRow'

interface ExpensesListProps {
  year: number
  month: number
}

export function ExpensesList({ year, month }: ExpensesListProps) {
  const { data, isLoading, error } = useExpensesByMonth(year, month)
  const markAsPaid = useMarkAsPaid()
  const reversePayment = useReversePayment()
  const deleteExpense = useDeleteExpense()
  const navigate = useNavigate()
  const today = new Date()

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
  if (!data || data.length === 0) return <p className="p-10 text-center text-gray-500">No expenses this month 🎉</p>

  return (
    <div className="space-y-3">
      {data.map((expense) => {
        const onDelete = () => {
          if (window.confirm('Delete this expense?')) {
            deleteExpense.mutate(expense.id)
          }
        }
        const onEdit = () => navigate(`/expenses/${expense.id}/edit`)

        return expense.paid_at ? (
          <ExpenseRow
            key={expense.id}
            expense={expense}
            primaryActionLabel="Reverse Payment"
            primaryActionIcon="restore-icon"
            onPrimaryAction={() => reversePayment.mutate(expense.id)}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ) : (
          <ExpenseRow
            key={expense.id}
            expense={expense}
            status={expenseStatus(expense.due_date, today)}
            primaryActionLabel="Mark as Paid"
            onPrimaryAction={() => markAsPaid.mutate(expense.id)}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        )
      })}
    </div>
  )
}