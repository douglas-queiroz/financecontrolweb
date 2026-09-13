import { Route, Routes, useParams } from 'react-router-dom'
import { useExpense } from './api/expenses'
import { AppShell } from './components/AppShell'
import { SkeletonRow } from './components/SkeletonRow'
import { AssetDetailPage } from './features/assets/AssetDetailPage'
import { AssetForm } from './features/assets/AssetForm'
import { AssetsPage } from './features/assets/AssetsPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { ExpenseForm } from './features/expenses/ExpenseForm/ExpenseForm'
import { ExpensesPage } from './features/expenses/ExpensesPage'

function EditExpenseRoute() {
  const { id = '' } = useParams()
  const { data: expense, isLoading } = useExpense(id)

  if (isLoading || !expense) {
    return (
      <div className="p-4">
        <div className="mx-auto max-w-2xl space-y-3">
          <SkeletonRow />
        </div>
      </div>
    )
  }

  return <ExpenseForm mode="edit" initialExpense={expense} />
}

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/expenses/new" element={<ExpenseForm mode="create" />} />
        <Route path="/expenses/:id/edit" element={<EditExpenseRoute />} />
        <Route path="/assets" element={<AssetsPage />} />
        <Route path="/assets/new" element={<AssetForm />} />
        <Route path="/assets/:id" element={<AssetDetailPage />} />
      </Route>
    </Routes>
  )
}

export default App