import { useState } from 'react'
import { Fab } from '../../components/Fab'
import { Tabs } from '../../components/Tabs'
import { PaidExpensesList } from './PaidList/PaidExpensesList'
import { UnpaidExpensesList } from './UnpaidList/UnpaidExpensesList'

type Tab = 'unpaid' | 'paid'

export function ExpensesPage() {
  const [tab, setTab] = useState<Tab>('unpaid')

  return (
    <div className="min-h-screen bg-surface-variant">
      <header className="sticky top-0 z-20 bg-surface shadow-elevation-1">
        <div className="mx-auto max-w-2xl px-4">
          <h1 className="py-4 text-xl font-medium text-gray-900">Financial Control</h1>
        </div>
      </header>
      <Tabs
        tabs={[
          { id: 'unpaid', label: 'Unpaid' },
          { id: 'paid', label: 'Paid' },
        ]}
        active={tab}
        onChange={(id) => setTab(id as Tab)}
      />
      <main className="mx-auto max-w-2xl px-4 pb-28 pt-4">
        {tab === 'unpaid' ? <UnpaidExpensesList /> : <PaidExpensesList />}
      </main>
      <Fab to="/expenses/new" label="New expense" />
    </div>
  )
}