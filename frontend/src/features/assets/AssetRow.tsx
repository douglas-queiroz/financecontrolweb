import { useNavigate } from 'react-router-dom'
import { formatBRL } from '../../lib/currency'
import type { Asset } from './types'

const CATEGORY_LABELS: Record<Asset['category'], string> = {
  reit: 'REIT',
  stock: 'Stock',
  bond: 'Bond',
  bitcoin: 'Bitcoin',
}

interface AssetRowProps {
  asset: Asset
}

export function AssetRow({ asset }: AssetRowProps) {
  const navigate = useNavigate()
  const gain = Number(asset.unrealized_gain_loss_brl)

  return (
    <button
      type="button"
      onClick={() => navigate(`/assets/${asset.id}`)}
      data-testid={`asset-row-${asset.id}`}
      className="flex w-full items-center justify-between gap-3 rounded-xl bg-surface p-4 text-left shadow-elevation-1"
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-gray-900">{asset.name}</p>
        <div className="mt-1 flex items-center gap-2">
          <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
            {CATEGORY_LABELS[asset.category]}
          </span>
          <p className="text-sm text-gray-500">{asset.quantity}</p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-medium text-gray-900">{formatBRL(asset.current_value_brl)}</p>
        <p className={gain >= 0 ? 'text-sm text-success-600' : 'text-sm text-danger-600'}>
          {gain >= 0 ? '+' : ''}
          {formatBRL(asset.unrealized_gain_loss_brl)}
        </p>
      </div>
    </button>
  )
}