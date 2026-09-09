import { useNavigate } from 'react-router-dom'
import { useDeleteExpense, useMarkAsPaid, useUnpaidExpenses } from '../../../api/expenses'
import { ExpenseRow } from '../shared/ExpenseRow'

function isDue(dueDate: string, today: Date): boolean {
  return new Date(dueDate) <= today
}

export function UnpaidExpensesList() {
  const { data, isLoading, error } = useUnpaidExpenses()
  const markAsPaid = useMarkAsPaid()
  const deleteExpense = useDeleteExpense()
  const navigate = useNavigate()
  const today = new Date()

  if (isLoading) return <p className="p-4">Loading…</p>
  if (error) return <p className="p-4 text-red-600">Failed to load expenses.</p>

  return (
    <div>
      {data?.map((expense) => (
        <ExpenseRow
          key={expense.id}
          expense={expense}
          highlighted={isDue(expense.due_date, today)}
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