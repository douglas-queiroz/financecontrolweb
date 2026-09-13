import type { ExpenseStatus } from './ExpenseRow'

const DUE_SOON_DAYS = 3

export function expenseStatus(dueDate: string, today: Date): ExpenseStatus {
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  const startOfToday = new Date(today)
  startOfToday.setHours(0, 0, 0, 0)
  const daysUntilDue = Math.round((due.getTime() - startOfToday.getTime()) / 86_400_000)
  if (daysUntilDue < 0) return 'overdue'
  if (daysUntilDue <= DUE_SOON_DAYS) return 'due-soon'
  return 'normal'
}