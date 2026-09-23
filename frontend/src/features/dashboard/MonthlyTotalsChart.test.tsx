import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MonthlyTotalsChart } from './MonthlyTotalsChart'
import { toChartPoints } from './chartPoints'
import type { MonthlyTotal } from './types'

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>()
  const { cloneElement } = await import('react')
  return {
    ...actual,
    // jsdom has no layout, so give the chart a fixed size instead of measuring.
    ResponsiveContainer: ({
      children,
    }: {
      children: ReactElement<{ width?: number | string; height?: number | string }>
    }) => cloneElement(children, { width: 600, height: 300 }),
  }
})

// Pin "today" so the fixtures and expectations are deterministic.
const NOW = new Date(2026, 8, 15) // 15 Sep 2026

function fixture(overrides: Partial<MonthlyTotal> = {}, now: Date = NOW): MonthlyTotal[] {
  const baseIndex = now.getFullYear() * 12 + now.getMonth()
  const totals: MonthlyTotal[] = Array.from({ length: 12 }, (_, i) => {
    const index = baseIndex - 11 + i
    const year = Math.floor(index / 12)
    const month = (index % 12) + 1
    return { month: `${year}-${String(month).padStart(2, '0')}`, total: '100.00' }
  })
  totals[11] = { ...totals[11], ...overrides }
  return totals
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('toChartPoints', () => {
  it('points the highlighted bar at next month once the current month is fully paid', () => {
    const points = toChartPoints(fixture({ all_paid: true, next_month_total: '500.00' }))
    const last = points[11]

    expect(last.month).toBe('2026-09') // React key stays the underlying month
    expect(last.isCurrentMonth).toBe(true)
    expect(last.isShowingNextMonth).toBe(true)
    expect(last.label).toBe("Oct '26")
    expect(last.fullMonth).toBe('October 2026')
    expect(last.total).toBe('500.00')
  })

  it('keeps the current month while any expense is still unpaid', () => {
    const points = toChartPoints(fixture({ all_paid: false, next_month_total: '500.00' }))
    const last = points[11]

    expect(last.isShowingNextMonth).toBe(false)
    expect(last.label).toBe("Sep '26")
    expect(last.fullMonth).toBe('September 2026')
    expect(last.total).toBe('100.00')
  })

  it('keeps the current month when the next month total is missing', () => {
    const points = toChartPoints(fixture({ all_paid: true }))
    const last = points[11]

    expect(last.isShowingNextMonth).toBe(false)
    expect(last.label).toBe("Sep '26")
    expect(last.total).toBe('100.00')
  })

  it('never swaps labels on buckets other than the current month', () => {
    const totals = fixture()
    totals[10] = { ...totals[10], all_paid: true, next_month_total: '999.00' }

    const points = toChartPoints(totals)
    const august = points[10]

    expect(august.isShowingNextMonth).toBe(false)
    expect(august.label).toBe("Aug '26")
    expect(august.total).toBe('100.00')
  })

  it('wraps December to January of the next year', () => {
    const december = new Date(2026, 11, 15)
    vi.setSystemTime(december)

    const points = toChartPoints(fixture({ all_paid: true, next_month_total: '700.00' }, december))
    const last = points[11]

    expect(last.label).toBe("Jan '27")
    expect(last.fullMonth).toBe('January 2027')
    expect(last.total).toBe('700.00')
    expect(last.month).toBe('2026-12')
  })
})

describe('MonthlyTotalsChart', () => {
  it('renders the next month label once the current month is fully paid', () => {
    render(<MonthlyTotalsChart data={fixture({ all_paid: true, next_month_total: '500.00' })} />)

    expect(screen.getByTestId('monthly-totals-chart')).toBeInTheDocument()
    expect(screen.getByText("Oct '26")).toBeInTheDocument()
    expect(screen.queryByText("Sep '26")).not.toBeInTheDocument()
  })

  it('renders the current month label while it is not fully paid', () => {
    render(<MonthlyTotalsChart data={fixture({ all_paid: false })} />)

    expect(screen.getByText("Sep '26")).toBeInTheDocument()
    expect(screen.queryByText("Oct '26")).not.toBeInTheDocument()
  })
})
