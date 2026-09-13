import { useState } from 'react'
import { Fab } from '../../components/Fab'
import { ExpensesList } from './ExpensesList/ExpensesList'
import { MonthNavigator } from './MonthNavigator/MonthNavigator'

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta
  const nextYear = Math.floor(index / 12)
  const nextMonth = (index % 12) + 1
  return { year: nextYear, month: nextMonth }
}

export function ExpensesPage() {
  const today = new Date()
  const [{ year, month }, setYearMonth] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 })

  return (
    <div>
      <MonthNavigator
        year={year}
        month={month}
        onPrevious={() => setYearMonth(shiftMonth(year, month, -1))}
        onNext={() => setYearMonth(shiftMonth(year, month, 1))}
      />
      <main className="mx-auto max-w-2xl px-4 pb-28 pt-4">
        <ExpensesList year={year} month={month} />
      </main>
      <Fab to="/expenses/new" label="New expense" />
    </div>
  )
}