import type { Expense } from '../types'

interface ExpenseRowProps {
  expense: Expense
  highlighted?: boolean
  primaryActionLabel: string
  onPrimaryAction: () => void
  onEdit: () => void
  onDelete: () => void
}

export function ExpenseRow({
  expense,
  highlighted = false,
  primaryActionLabel,
  onPrimaryAction,
  onEdit,
  onDelete,
}: ExpenseRowProps) {
  return (
    <div
      data-testid={`expense-row-${expense.id}`}
      className={`flex items-center justify-between border-b p-3 ${
        highlighted ? 'bg-amber-50 border-l-4 border-l-amber-500' : ''
      }`}
    >
      <div>
        <p className="font-medium">{expense.description}</p>
        <p className="text-sm text-gray-500">
          {expense.amount} · due {expense.due_date}
        </p>
      </div>
      <div className="flex gap-2">
        <button onClick={onPrimaryAction} className="text-blue-600">
          {primaryActionLabel}
        </button>
        <button onClick={onEdit} className="text-gray-600">
          Edit
        </button>
        <button onClick={onDelete} className="text-red-600">
          Delete
        </button>
      </div>
    </div>
  )
}