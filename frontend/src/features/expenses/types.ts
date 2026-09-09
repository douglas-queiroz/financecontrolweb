export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface Expense {
  id: string
  description: string
  amount: string
  due_date: string
  paid_at: string | null
  created_at: string
  updated_at: string
  is_recurring: boolean
  recurrence_frequency: RecurrenceFrequency | null
  recurrence_interval: number
  recurrence_end_date: string | null
}

export interface ExpenseInput {
  description: string
  amount: string
  due_date: string
  is_recurring: boolean
  recurrence_frequency: RecurrenceFrequency | null
  recurrence_interval: number
  recurrence_end_date: string | null
}