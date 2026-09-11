export type AssetCategory = 'reit' | 'stock' | 'bond' | 'bitcoin'
export type Currency = 'USD' | 'EUR' | 'BRL'
export type TransactionType = 'buy' | 'sell'

export interface Asset {
  id: string
  name: string
  category: AssetCategory
  code: string | null
  currency: Currency | null
  quantity: string
  average_cost: string
  average_cost_brl: string
  current_value_brl: string
  unrealized_gain_loss_brl: string
  created_at: string
}

export interface AssetCreateInput {
  name: string
  category: AssetCategory
  code: string | null
  currency: Currency | null
  quantity: string
  unit_price: string
  date: string
  fx_rate_to_brl: string | null
}

export interface AssetTransaction {
  id: string
  asset_id: string
  type: TransactionType
  quantity: string
  unit_price: string
  total_amount: string
  realized_gain_loss_brl: string | null
  date: string
  created_at: string
}

export interface AssetTransactionInput {
  type: TransactionType
  quantity: string
  unit_price: string
  date: string
  fx_rate_to_brl: string | null
}

export interface AssetValueUpdateInput {
  price: string
  date: string
}