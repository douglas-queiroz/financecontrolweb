import { Route, Routes, useParams } from 'react-router-dom'
import { usePaidExpenses, useUnpaidExpenses } from './api/expenses'
import { ExpenseForm } from './features/expenses/ExpenseForm/ExpenseForm'
import { ExpensesPage } from './features/expenses/ExpensesPage'

function EditExpenseRoute() {
  const { id } = useParams()
  const unpaid = useUnpaidExpenses()
  const paid = usePaidExpenses()

  const expense =
    unpaid.data?.find((e) => e.id === id) ?? paid.data?.pages.flat().find((e) => e.id === id)

  if (!expense) return <p className="p-4">Loading…</p>

  return <ExpenseForm mode="edit" initialExpense={expense} />
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<ExpensesPage />} />
      <Route path="/expenses/new" element={<ExpenseForm mode="create" />} />
      <Route path="/expenses/:id/edit" element={<EditExpenseRoute />} />
    </Routes>
  )
}

export default App