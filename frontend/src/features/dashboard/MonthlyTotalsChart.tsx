import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatBRL } from '../../lib/currency'
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

const CURRENT_MONTH_COLOR = '#3949ab'
const PAST_MONTH_COLOR = '#c5cae9'

interface ChartPoint extends MonthlyTotal {
  label: string
  fullMonth: string
  isCurrentMonth: boolean
}

interface MonthlyTotalsChartProps {
  data: MonthlyTotal[]
}

interface TooltipEntry {
  payload: ChartPoint
}

interface ChartTooltipProps {
  active?: boolean
  payload?: TooltipEntry[]
}

function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function toChartPoints(totals: MonthlyTotal[]): ChartPoint[] {
  const current = currentMonthKey()
  return totals.map((total) => {
    const [year, month] = total.month.split('-')
    const monthNumber = Number(month)
    return {
      ...total,
      label: `${SHORT_MONTHS[monthNumber - 1]} '${year.slice(2)}`,
      fullMonth: `${FULL_MONTHS[monthNumber - 1]} ${year}`,
      isCurrentMonth: total.month === current,
    }
  })
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const point = payload[0].payload
  return (
    <div className="rounded-lg bg-surface p-3 text-sm shadow-elevation-2">
      <p className="font-medium text-gray-900">{point.fullMonth}</p>
      <p className="text-gray-600">{formatBRL(point.total)}</p>
    </div>
  )
}

export function MonthlyTotalsChart({ data }: MonthlyTotalsChartProps) {
  const points = toChartPoints(data)

  return (
    <div className="h-72" data-testid="monthly-totals-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e0e0e0" />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6b7280' }} tickMargin={8} />
          <YAxis
            tick={{ fontSize: 12, fill: '#6b7280' }}
            tickFormatter={(value: number) => formatBRL(value)}
            width={88}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0, 0, 0, 0.04)' }} />
          <Bar dataKey="total" radius={[4, 4, 0, 0]}>
            {points.map((point) => (
              <Cell key={point.month} fill={point.isCurrentMonth ? CURRENT_MONTH_COLOR : PAST_MONTH_COLOR} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}