type ChipTone = 'success' | 'warning' | 'danger'

const TONE_CLASSES: Record<ChipTone, { dot: string; background: string; text: string }> = {
  success: { dot: 'bg-success-500', background: 'bg-success-50', text: 'text-success-700' },
  warning: { dot: 'bg-warning-500', background: 'bg-warning-50', text: 'text-warning-700' },
  danger: { dot: 'bg-danger-500', background: 'bg-danger-50', text: 'text-danger-700' },
}

interface ChipProps {
  label: string
  tone: ChipTone
  testId?: string
}

export function Chip({ label, tone, testId }: ChipProps) {
  const classes = TONE_CLASSES[tone]
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${classes.background} ${classes.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${classes.dot}`} />
      {label}
    </span>
  )
}