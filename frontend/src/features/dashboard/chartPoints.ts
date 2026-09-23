import type { MonthlyTotal } from './types'

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const FULL_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export interface ChartPoint extends MonthlyTotal {
  label: string
  fullMonth: string
  isCurrentMonth: boolean
  isShowingNextMonth: boolean
}

function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthParts(key: string): [number, number] {
  const [year, month] = key.split('-').map(Number)
  return [year, month]
}

function nextMonthKey(monthKey: string): string {
  const [year, month] = monthParts(monthKey)
  const index = year * 12 + (month - 1) + 1
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

function labelsFor(monthKey: string): { label: string; fullMonth: string } {
  const [year, month] = monthParts(monthKey)
  const yearLabel = String(year)
  return {
    label: `${SHORT_MONTHS[month - 1]} '${yearLabel.slice(2)}`,
    fullMonth: `${FULL_MONTHS[month - 1]} ${yearLabel}`,
  }
}

export function toChartPoints(totals: MonthlyTotal[]): ChartPoint[] {
  const current = currentMonthKey()
  const points = totals.map((total) => {
    const isCurrentMonth = total.month === current
    return {
      ...total,
      ...labelsFor(total.month),
      isCurrentMonth,
      isShowingNextMonth: false,
    }
  })

  const currentPoint = points.find((point) => point.month === current)
  if (currentPoint && currentPoint.all_paid === true && currentPoint.next_month_total != null) {
    const nextKey = nextMonthKey(current)
    points.push({
      ...currentPoint,
      month: nextKey,
      total: currentPoint.next_month_total,
      ...labelsFor(nextKey),
      isCurrentMonth: false,
      isShowingNextMonth: true,
    })
  }
  return points
}