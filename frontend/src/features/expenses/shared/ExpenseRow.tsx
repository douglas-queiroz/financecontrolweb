import { Chip } from '../../../components/Chip'
import { Icon } from '../../../components/Icon'
import { formatDateTime, formatDate } from '../../../lib/date'
import { formatBRL } from '../../../lib/currency'
import type { Expense } from '../types'

export type ExpenseStatus = 'overdue' | 'due-soon' | 'normal'

interface ExpenseRowProps {
  expense: Expense
  status?: ExpenseStatus
  primaryActionLabel: string
  primaryActionIcon?: string
  onPrimaryAction: () => void
  onEdit: () => void
  onDelete: () => void
}

export function ExpenseRow({
  expense,
  status = 'normal',
  primaryActionLabel,
  primaryActionIcon = 'check-icon',
  onPrimaryAction,
  onEdit,
  onDelete,
}: ExpenseRowProps) {
  const isPaid = expense.paid_at != null

  return (
    <div
      data-testid={`expense-row-${expense.id}`}
      className={`flex items-start justify-between gap-3 rounded-xl bg-surface p-4 shadow-elevation-1 ${
        isPaid ? 'opacity-60' : ''
      }`}
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-gray-900">{expense.description}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-sm text-gray-500">
            {formatBRL(expense.amount)} · due {formatDate(expense.due_date)}
            {expense.paid_at ? ` · paid ${formatDateTime(expense.paid_at)}` : ''}
          </p>
          {isPaid ? (
            <Chip label="Paid" tone="success" testId={`status-chip-${expense.id}`} />
          ) : (
            <>
              {status === 'overdue' && <Chip label="Overdue" tone="danger" testId={`status-chip-${expense.id}`} />}
              {status === 'due-soon' && <Chip label="Due soon" tone="warning" testId={`status-chip-${expense.id}`} />}
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={onPrimaryAction}
          aria-label={primaryActionLabel}
          data-testid={`primary-action-${expense.id}`}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-primary-700 transition-colors hover:bg-primary-200"
        >
          <Icon name={primaryActionIcon} />
        </button>
        <button
          onClick={onEdit}
          aria-label="Edit"
          data-testid={`edit-${expense.id}`}
          className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <Icon name="edit-icon" />
        </button>
        <button
          onClick={onDelete}
          aria-label="Delete"
          data-testid={`delete-${expense.id}`}
          className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-danger-50 hover:text-danger-600"
        >
          <Icon name="delete-icon" />
        </button>
      </div>
    </div>
  )
}