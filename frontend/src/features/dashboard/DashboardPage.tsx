import { useAssetMonthlyTotals } from '../../api/assets'
import { useMonthlyTotals } from '../../api/expenses'
import { AssetMonthlyTotalsChart } from './AssetMonthlyTotalsChart'
import { MonthlyTotalsChart } from './MonthlyTotalsChart'

export function DashboardPage() {
  const { data, isLoading, error } = useMonthlyTotals()
  const assets = useAssetMonthlyTotals()

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <div className="rounded-xl bg-surface p-6 shadow-elevation-1">
        <h2 className="mb-6 text-lg font-medium text-gray-900">Monthly expenses</h2>
        {isLoading ? (
          <div className="h-72 animate-pulse rounded-lg bg-gray-200" data-testid="chart-loading" />
        ) : error ? (
          <p className="text-center text-danger-600" data-testid="chart-error">
            Failed to load monthly totals.
          </p>
        ) : (
          <MonthlyTotalsChart data={data ?? []} />
        )}
      </div>
      <div className="rounded-xl bg-surface p-6 shadow-elevation-1">
        <h2 className="mb-6 text-lg font-medium text-gray-900">Monthly assets</h2>
        {assets.isLoading ? (
          <div className="h-72 animate-pulse rounded-lg bg-gray-200" data-testid="asset-chart-loading" />
        ) : assets.error ? (
          <p className="text-center text-danger-600" data-testid="asset-chart-error">
            Failed to load asset totals.
          </p>
        ) : (
          <AssetMonthlyTotalsChart data={assets.data ?? []} />
        )}
      </div>
    </div>
  )
}