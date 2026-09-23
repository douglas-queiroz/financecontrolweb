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

export function toChartPoints(totals: MonthlyTotal[]): ChartPoint[] {
  const current = currentMonthKey()
  return totals.map((total) => {
    const [year, month] = total.month.split('-')
    const monthNumber = Number(month)
    const isCurrentMonth = total.month === current
    // Once everything due this month is paid, the highlighted bar points at
    // next month's literal rows instead of this month's (now settled) total.
    const isShowingNextMonth =
      isCurrentMonth && total.all_paid === true && total.next_month_total != null

    let displayYear = Number(year)
    let displayMonth = monthNumber
    if (isShowingNextMonth) {
      const nextIndex = displayYear * 12 + (displayMonth - 1) + 1
      displayYear = Math.floor(nextIndex / 12)
      displayMonth = (nextIndex % 12) + 1
    }
    const displayYearLabel = String(displayYear)

    return {
      ...total,
      total: isShowingNextMonth && total.next_month_total != null ? total.next_month_total : total.total,
      label: `${SHORT_MONTHS[displayMonth - 1]} '${displayYearLabel.slice(2)}`,
      fullMonth: `${FULL_MONTHS[displayMonth - 1]} ${displayYearLabel}`,
      isCurrentMonth,
      isShowingNextMonth,
    }
  })
}
