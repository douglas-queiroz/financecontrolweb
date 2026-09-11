import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAssets, useAssetTransactions, useUpdateAssetValue } from '../../api/assets'
import { CurrencyInput } from '../../components/CurrencyInput'
import { SkeletonRow } from '../../components/SkeletonRow'
import { formatBRL } from '../../lib/currency'
import { BuySellForm } from './BuySellForm'

export function AssetDetailPage() {
  const { id } = useParams()
  const { data: assets } = useAssets()
  const asset = assets?.find((a) => a.id === id)
  const { data: transactions, isLoading, error } = useAssetTransactions(id ?? '')
  const [showTransactionForm, setShowTransactionForm] = useState(false)
  const [showValueForm, setShowValueForm] = useState(false)
  const [valuePrice, setValuePrice] = useState('0.00')
  const [valueDate, setValueDate] = useState('')
  const updateValue = useUpdateAssetValue(id ?? '')

  if (!asset) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 px-4 pt-4">
        <SkeletonRow />
      </div>
    )
  }

  const unitCurrencyLabel = asset.category === 'bitcoin' ? 'BRL' : asset.currency

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <div className="rounded-xl bg-surface p-6 shadow-elevation-1">
        <h1 className="text-xl font-medium text-gray-900">{asset.name}</h1>
        <p className="mt-2 text-sm text-gray-500">Quantity: {asset.quantity}</p>
        <p className="text-sm text-gray-500">Average cost: {formatBRL(asset.average_cost_brl)}</p>
        <p className="text-2xl font-medium text-gray-900">{formatBRL(asset.current_value_brl)}</p>
        <p
          data-testid="unrealized-gain-loss"
          className={Number(asset.unrealized_gain_loss_brl) >= 0 ? 'text-success-600' : 'text-danger-600'}
        >
          {formatBRL(asset.unrealized_gain_loss_brl)}
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setShowTransactionForm((v) => !v)}
            className="rounded-lg bg-primary-600 px-4 py-2 font-medium text-white"
          >
            Buy / Sell
          </button>
          {asset.category === 'bond' && (
            <button
              type="button"
              onClick={() => setShowValueForm((v) => !v)}
              className="rounded-lg bg-gray-200 px-4 py-2 font-medium text-gray-700"
            >
              Update value
            </button>
          )}
        </div>
      </div>

      {showTransactionForm && (
        <BuySellForm asset={asset} onDone={() => setShowTransactionForm(false)} />
      )}

      {showValueForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            updateValue.mutate(
              { price: valuePrice, date: valueDate },
              { onSuccess: () => setShowValueForm(false) },
            )
          }}
          className="space-y-4 rounded-lg bg-surface-variant p-4"
        >
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">New value</span>
            <CurrencyInput
              value={valuePrice}
              onChange={setValuePrice}
              className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Date</span>
            <input
              type="date"
              value={valueDate}
              onChange={(e) => setValueDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={Number(valuePrice) <= 0 || valueDate.length === 0}
            className="w-full rounded-lg bg-primary-600 py-3 font-medium text-white disabled:pointer-events-none disabled:opacity-50"
          >
            Save
          </button>
        </form>
      )}

      <div className="rounded-xl bg-surface p-4 shadow-elevation-1">
        <h2 className="mb-2 font-medium text-gray-900">Transaction history</h2>
        {isLoading && <SkeletonRow />}
        {error && <p className="text-danger-600">Failed to load transactions.</p>}
        {transactions && transactions.length === 0 && (
          <p className="text-gray-500">No transactions yet.</p>
        )}
        {transactions && transactions.length > 0 && (
          <ul className="space-y-2">
            {transactions.map((t) => (
              <li key={t.id} data-testid={`transaction-${t.id}`} className="flex justify-between text-sm">
                <span>
                  {t.type} {t.quantity} @ {t.unit_price} {unitCurrencyLabel} · {t.date}
                </span>
                {t.realized_gain_loss_brl !== null && (
                  <span
                    className={
                      Number(t.realized_gain_loss_brl) >= 0 ? 'text-success-600' : 'text-danger-600'
                    }
                  >
                    {formatBRL(t.realized_gain_loss_brl)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}