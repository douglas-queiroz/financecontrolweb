interface MonthNavigatorProps {
  year: number
  month: number
  onPrevious: () => void
  onNext: () => void
}

const MONTH_FORMATTER = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })

function formatMonthLabel(year: number, month: number): string {
  const label = MONTH_FORMATTER.format(new Date(year, month - 1, 1))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function MonthNavigator({ year, month, onPrevious, onNext }: MonthNavigatorProps) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-3">
      <button
        onClick={onPrevious}
        aria-label="Previous month"
        data-testid="month-nav-previous"
        className="flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
      >
        ‹
      </button>
      <p data-testid="month-nav-label" className="w-44 text-center text-sm font-medium text-gray-900">
        {formatMonthLabel(year, month)}
      </p>
      <button
        onClick={onNext}
        aria-label="Next month"
        data-testid="month-nav-next"
        className="flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
      >
        ›
      </button>
    </div>
  )
}