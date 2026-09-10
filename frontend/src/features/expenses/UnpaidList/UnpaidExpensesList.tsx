import { useNavigate } from 'react-router-dom'
import { useDeleteExpense, useMarkAsPaid, useUnpaidExpenses } from '../../../api/expenses'
import { SkeletonRow } from '../../../components/SkeletonRow'
import { ExpenseRow, type ExpenseStatus } from '../shared/ExpenseRow'

const DUE_SOON_DAYS = 3

function expenseStatus(dueDate: string, today: Date): ExpenseStatus {
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  const startOfToday = new Date(today)
  startOfToday.setHours(0, 0, 0, 0)
  const daysUntilDue = Math.round((due.getTime() - startOfToday.getTime()) / 86_400_000)
  if (daysUntilDue < 0) return 'overdue'
  if (daysUntilDue <= DUE_SOON_DAYS) return 'due-soon'
  return 'normal'
}

export function UnpaidExpensesList() {
  const { data, isLoading, error } = useUnpaidExpenses()
  const markAsPaid = useMarkAsPaid()
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
  if (!data || data.length === 0) return <p className="p-10 text-center text-gray-500">No unpaid expenses 🎉</p>

  return (
    <div className="space-y-3">
      {data.map((expense) => (
        <ExpenseRow
          key={expense.id}
          expense={expense}
          status={expenseStatus(expense.due_date, today)}
          primaryActionLabel="Mark as Paid"
          onPrimaryAction={() => markAsPaid.mutate(expense.id)}
          onEdit={() => navigate(`/expenses/${expense.id}/edit`)}
          onDelete={() => {
            if (window.confirm('Delete this expense?')) {
              deleteExpense.mutate(expense.id)
            }
          }}
        />
      ))}
    </div>
  )
}