import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useCreateExpense, useUpdateExpense } from '../../../api/expenses'
import type { Expense, ExpenseInput, RecurrenceFrequency } from '../types'

interface ExpenseFormProps {
  mode: 'create' | 'edit'
  initialExpense?: Expense
}

const FREQUENCIES: RecurrenceFrequency[] = ['daily', 'weekly', 'monthly', 'yearly']

const FIELD_CLASSES =
  'w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100'

export function ExpenseForm({ mode, initialExpense }: ExpenseFormProps) {
  const [description, setDescription] = useState(initialExpense?.description ?? '')
  const [amount, setAmount] = useState(initialExpense?.amount ?? '')
  const [dueDate, setDueDate] = useState(initialExpense?.due_date ?? '')
  const [isRecurring, setIsRecurring] = useState(initialExpense?.is_recurring ?? false)
  const [frequency, setFrequency] = useState<RecurrenceFrequency | null>(
    initialExpense?.recurrence_frequency ?? null,
  )
  const [interval, setInterval] = useState(initialExpense?.recurrence_interval ?? 1)
  const [endDate, setEndDate] = useState(initialExpense?.recurrence_end_date ?? '')

  const createExpense = useCreateExpense()
  const updateExpense = useUpdateExpense()
  const navigate = useNavigate()
  const { id } = useParams()

  const isValid =
    description.trim().length > 0 &&
    Number(amount) > 0 &&
    dueDate.length > 0 &&
    (!isRecurring || frequency !== null)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!isValid) return

    const input: ExpenseInput = {
      description,
      amount,
      due_date: dueDate,
      is_recurring: isRecurring,
      recurrence_frequency: isRecurring ? frequency : null,
      recurrence_interval: interval,
      recurrence_end_date: isRecurring && endDate ? endDate : null,
    }

    const onSuccess = () => navigate('/')

    if (mode === 'create') {
      createExpense.mutate(input, { onSuccess })
    } else if (id) {
      updateExpense.mutate({ id, input }, { onSuccess })
    }
  }

  return (
    <div className="min-h-screen bg-surface-variant">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="rounded-xl bg-surface p-6 shadow-elevation-1">
          <h1 className="mb-6 text-xl font-medium text-gray-900">
            {mode === 'create' ? 'New expense' : 'Edit expense'}
          </h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Description</span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={FIELD_CLASSES}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Amount</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={FIELD_CLASSES}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Due date</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={FIELD_CLASSES}
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="h-4 w-4 rounded accent-primary-600"
              />
              Recurring
            </label>
            {isRecurring && (
              <div className="space-y-4 rounded-lg bg-surface-variant p-4">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Frequency</span>
                  <select
                    value={frequency ?? ''}
                    onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}
                    className={FIELD_CLASSES}
                  >
                    <option value="">Select…</option>
                    {FREQUENCIES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Every</span>
                  <input
                    type="number"
                    min={1}
                    value={interval}
                    onChange={(e) => setInterval(Number(e.target.value))}
                    className={FIELD_CLASSES}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">End date</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={FIELD_CLASSES}
                  />
                </label>
              </div>
            )}
            <button
              type="submit"
              disabled={!isValid}
              className="mt-2 w-full rounded-lg bg-primary-600 py-3 font-medium text-white transition-colors hover:bg-primary-700 disabled:pointer-events-none disabled:opacity-50"
            >
              Save
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}