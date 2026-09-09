import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useCreateExpense, useUpdateExpense } from '../../../api/expenses'
import type { Expense, ExpenseInput, RecurrenceFrequency } from '../types'

interface ExpenseFormProps {
  mode: 'create' | 'edit'
  initialExpense?: Expense
}

const FREQUENCIES: RecurrenceFrequency[] = ['daily', 'weekly', 'monthly', 'yearly']

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4">
      <label>
        Description
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="block border p-1"
        />
      </label>
      <label>
        Amount
        <input value={amount} onChange={(e) => setAmount(e.target.value)} className="block border p-1" />
      </label>
      <label>
        Due date
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="block border p-1"
        />
      </label>
      <label>
        <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
        Recurring
      </label>
      {isRecurring && (
        <>
          <label>
            Frequency
            <select
              value={frequency ?? ''}
              onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}
              className="block border p-1"
            >
              <option value="">Select…</option>
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label>
            Every
            <input
              type="number"
              min={1}
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
              className="block border p-1"
            />
          </label>
          <label>
            End date
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="block border p-1"
            />
          </label>
        </>
      )}
      <button type="submit" disabled={!isValid} className="mt-2 bg-blue-600 text-white p-2 disabled:opacity-50">
        Save
      </button>
    </form>
  )
}