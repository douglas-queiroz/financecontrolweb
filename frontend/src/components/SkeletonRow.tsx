export function SkeletonRow() {
  return (
    <div
      data-testid="skeleton-row"
      className="animate-pulse rounded-xl bg-surface p-4 shadow-elevation-1"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/3 rounded bg-gray-200" />
          <div className="h-3 w-1/2 rounded bg-gray-200" />
        </div>
        <div className="h-9 w-9 rounded-full bg-gray-200" />
      </div>
    </div>
  )
}