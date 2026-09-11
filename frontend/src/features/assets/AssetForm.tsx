import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateAsset } from '../../api/assets'
import { CurrencyInput } from '../../components/CurrencyInput'
import type { AssetCategory, Currency } from './types'

const FIELD_CLASSES =
  'w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100'

const CATEGORIES: AssetCategory[] = ['reit', 'stock', 'bond', 'bitcoin']
const CURRENCIES: Currency[] = ['BRL', 'USD', 'EUR']

export function AssetForm() {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<AssetCategory>('stock')
  const [code, setCode] = useState('')
  const [currency, setCurrency] = useState<Currency>('BRL')
  const [quantity, setQuantity] = useState('')
  const [unitPrice, setUnitPrice] = useState('0.00')
  const [date, setDate] = useState('')
  const [fxRate, setFxRate] = useState('')

  const createAsset = useCreateAsset()
  const navigate = useNavigate()

  const needsCode = category === 'reit' || category === 'stock'
  const needsCurrency = category !== 'bitcoin'
  const isBrlPrice = category === 'bitcoin' || currency === 'BRL'
  const needsFxRate = needsCurrency && currency !== 'BRL'

  const isValid =
    name.trim().length > 0 &&
    (!needsCode || code.trim().length > 0) &&
    Number(quantity) > 0 &&
    Number(unitPrice) > 0 &&
    date.length > 0

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!isValid) return

    createAsset.mutate(
      {
        name,
        category,
        code: needsCode ? code : null,
        currency: needsCurrency ? currency : null,
        quantity,
        unit_price: unitPrice,
        date,
        fx_rate_to_brl: needsFxRate && fxRate ? fxRate : null,
      },
      { onSuccess: () => navigate('/assets') },
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="rounded-xl bg-surface p-6 shadow-elevation-1">
        <h1 className="mb-6 text-xl font-medium text-gray-900">New asset</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={FIELD_CLASSES} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as AssetCategory)}
              className={FIELD_CLASSES}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          {needsCode && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Code</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} className={FIELD_CLASSES} />
            </label>
          )}
          {needsCurrency && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Currency</span>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
                className={FIELD_CLASSES}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Quantity</span>
            <input value={quantity} onChange={(e) => setQuantity(e.target.value)} className={FIELD_CLASSES} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              Unit price{isBrlPrice ? '' : ` (${currency})`}
            </span>
            {isBrlPrice ? (
              <CurrencyInput value={unitPrice} onChange={setUnitPrice} className={FIELD_CLASSES} />
            ) : (
              <input
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className={FIELD_CLASSES}
              />
            )}
          </label>
          {needsFxRate && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">
                {currency} → BRL rate (only if today's rate isn't known yet)
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
            className="mt-2 w-full rounded-lg bg-primary-600 py-3 font-medium text-white transition-colors hover:bg-primary-700 disabled:pointer-events-none disabled:opacity-50"
          >
            Save
          </button>
        </form>
      </div>
    </div>
  )
}