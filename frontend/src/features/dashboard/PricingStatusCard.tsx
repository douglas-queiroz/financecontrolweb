import { usePricingStatus, useRefreshPricing } from '../../api/pricing'
import { formatDate } from '../../lib/date'

function updateLabel(iso: string | null | undefined): string {
  return iso ? formatDate(iso) : 'Never'
}

export function PricingStatusCard() {
  const { data, isLoading, error } = usePricingStatus()
  const refresh = useRefreshPricing()

  return (
    <div data-testid="pricing-status-card" className="rounded-xl bg-surface p-6 shadow-elevation-1">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">Market data</h2>
        <button
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          data-testid="pricing-refresh"
          className="rounded-full bg-primary-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
        >
          {refresh.isPending ? 'Refreshing…' : 'Refresh now'}
        </button>
      </div>
      {isLoading ? (
        <div data-testid="pricing-loading" className="mt-4 h-10 animate-pulse rounded-lg bg-gray-200" />
      ) : error ? (
        <p data-testid="pricing-error" className="mt-4 text-sm text-danger-600">
          Failed to load pricing status.
        </p>
      ) : (
        <dl className="mt-4 space-y-2 text-sm text-gray-700">
          <div className="flex items-center justify-between">
            <dt>Asset prices</dt>
            <dd data-testid="pricing-last-price" className="font-medium text-gray-900">
              {updateLabel(data?.last_price_update)}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt>FX rates (BRL)</dt>
            <dd data-testid="pricing-last-fx" className="font-medium text-gray-900">
              {updateLabel(data?.last_fx_update)}
            </dd>
          </div>
          {!data?.has_brapi_key && !data?.has_twelvedata_key && !data?.has_coingecko_key && (
            <p data-testid="pricing-keys-hint" className="pt-1 text-xs text-gray-500">
              Add provider API keys to fetch asset prices.
            </p>
          )}
        </dl>
      )}
    </div>
  )
}