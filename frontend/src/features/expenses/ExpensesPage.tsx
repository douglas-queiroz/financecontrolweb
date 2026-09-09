import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PaidExpensesList } from './PaidList/PaidExpensesList'
import { UnpaidExpensesList } from './UnpaidList/UnpaidExpensesList'

type Tab = 'unpaid' | 'paid'

export function ExpensesPage() {
  const [tab, setTab] = useState<Tab>('unpaid')

  return (
    <div>
      <header className="flex items-center justify-between p-4">
        <h1 className="text-2xl font-bold">Financial Control</h1>
        <Link to="/expenses/new" className="bg-blue-600 text-white px-3 py-1 rounded">
          + New
        </Link>
      </header>
      <div className="flex gap-2 px-4">
        <button
          onClick={() => setTab('unpaid')}
          className={tab === 'unpaid' ? 'font-bold underline' : ''}
        >
          Unpaid
        </button>
        <button onClick={() => setTab('paid')} className={tab === 'paid' ? 'font-bold underline' : ''}>
          Paid
        </button>
      </div>
      {tab === 'unpaid' ? <UnpaidExpensesList /> : <PaidExpensesList />}
    </div>
  )
}