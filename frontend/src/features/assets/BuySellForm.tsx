import { useState, type FormEvent } from 'react'
import { useCreateAssetTransaction } from '../../api/assets'
import { CurrencyInput } from '../../components/CurrencyInput'
import type { Asset, TransactionType } from './types'

const FIELD_CLASSES = 'w-full rounded-lg border border-gray-300 bg-surface px-3 py-2'

interface BuySellFormProps {
  asset: Asset
  onDone: () => void
}

export function BuySellForm({ asset, onDone }: BuySellFormProps) {
  const [type, setType] = useState<TransactionType>('buy')
  const [quantity, setQuantity] = useState('')
  const [unitPrice, setUnitPrice] = useState('0.00')
  const [date, setDate] = useState('')
  const [fxRate, setFxRate] = useState('')

  const createTransaction = useCreateAssetTransaction(asset.id)

  const isBrlPrice = asset.category === 'bitcoin' || asset.currency === 'BRL'
  const needsFxRate = asset.category !== 'bitcoin' && asset.currency !== 'BRL'

  const isValid = Number(quantity) > 0 && Number(unitPrice) > 0 && date.length > 0

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!isValid) return

    createTransaction.mutate(
      {
        type,
        quantity,
        unit_price: unitPrice,
        date,
        fx_rate_to_brl: needsFxRate && fxRate ? fxRate : null,
      },
      { onSuccess: onDone },
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg bg-surface-variant p-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setType('buy')}
          className={`flex-1 rounded-lg py-2 font-medium ${type === 'buy' ? 'bg-primary-600 text-white' : 'bg-surface text-gray-700'}`}
        >
          Buy
        </button>
        <button
          type="button"
          onClick={() => setType('sell')}
          className={`flex-1 rounded-lg py-2 font-medium ${type === 'sell' ? 'bg-primary-600 text-white' : 'bg-surface text-gray-700'}`}
        >
          Sell
        </button>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Quantity</span>
        <input value={quantity} onChange={(e) => setQuantity(e.target.value)} className={FIELD_CLASSES} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">
          Unit price{isBrlPrice ? '' : ` (${asset.currency})`}
        </span>
        {isBrlPrice ? (
          <CurrencyInput value={unitPrice} onChange={setUnitPrice} className={FIELD_CLASSES} />
        ) : (
          <input value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className={FIELD_CLASSES} />
        )}
      </label>
      {needsFxRate && (
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">
            {asset.currency} → BRL rate (only if today's rate isn't known yet)
          </span>
          <input value={fxRate} onChange={(e) => setFxRate(e.target.value)} className={FIELD_CLASSES} />
        </label>
      )}
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Date</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={FIELD_CLASSES} />
      </label>
      <button
        type="submit"
        disabled={!isValid}
        className="w-full rounded-lg bg-primary-600 py-3 font-medium text-white disabled:pointer-events-none disabled:opacity-50"
      >
        Save
      </button>
    </form>
  )
}