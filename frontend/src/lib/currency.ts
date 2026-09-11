const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatBRL(value: string | number): string {
  const numeric = typeof value === 'string' ? Number(value) : value
  return BRL_FORMATTER.format(numeric)
}

export function centsToDecimalString(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.trunc(cents))
  const wholePart = Math.floor(abs / 100)
  const centsPart = abs % 100
  return `${sign}${wholePart}.${centsPart.toString().padStart(2, '0')}`
}

export function decimalStringToCents(value: string): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.round(numeric * 100)
}