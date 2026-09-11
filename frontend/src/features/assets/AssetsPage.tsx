import { useMemo } from 'react'
import { useAssets } from '../../api/assets'
import { Fab } from '../../components/Fab'
import { SkeletonRow } from '../../components/SkeletonRow'
import { formatBRL } from '../../lib/currency'
import { AssetRow } from './AssetRow'

export function AssetsPage() {
  const { data, isLoading, error } = useAssets()

  const total = useMemo(
    () => (data ?? []).reduce((sum, asset) => sum + Number(asset.current_value_brl), 0),
    [data],
  )

  return (
    <main className="mx-auto max-w-2xl px-4 pb-28 pt-4">
      {isLoading && (
        <div className="space-y-3">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      )}
      {error && <p className="p-6 text-center text-danger-600">Failed to load assets.</p>}
      {!isLoading && !error && data && (
        <>
          <div className="mb-4 rounded-xl bg-surface p-4 shadow-elevation-1" data-testid="assets-total">
            <p className="text-sm text-gray-500">Total</p>
            <p className="text-2xl font-medium text-gray-900">{formatBRL(total)}</p>
          </div>
          {data.length === 0 ? (
            <p className="p-10 text-center text-gray-500">No assets yet.</p>
          ) : (
            <div className="space-y-3">
              {data.map((asset) => (
                <AssetRow key={asset.id} asset={asset} />
              ))}
            </div>
          )}
        </>
      )}
      <Fab to="/assets/new" label="New asset" />
    </main>
  )
}