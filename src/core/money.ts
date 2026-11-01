/** Formats an amount, showing decimals only when it has them (IDR rarely does). */
export function formatMoney(amount: number, currency: string, locale?: string): string {
  const digits = Number.isInteger(amount) ? 0 : 2
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount)
}

function separators(locale?: string) {
  const parts = new Intl.NumberFormat(locale).formatToParts(1234567.5)
  return {
    group: parts.find((p) => p.type === 'group')?.value ?? ',',
    decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
  }
}

/**
 * Normalizes what the user typed into an amount field: keeps digits and one
 * decimal separator (max 2 decimals) and re-inserts group separators.
 * "1234567" -> "1.234.567" in id-ID, "1,234,567" in en-US.
 */
export function formatAmountInput(text: string, locale?: string): string {
  const { group, decimal } = separators(locale)
  const cleaned = text.split(group).join('')
  const sepIndex = cleaned.indexOf(decimal)
  const intPart = (sepIndex === -1 ? cleaned : cleaned.slice(0, sepIndex)).replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, group)
  if (sepIndex === -1) return grouped
  const fraction = cleaned.slice(sepIndex + 1).replace(/\D/g, '').slice(0, 2)
  return `${grouped || '0'}${decimal}${fraction}`
}

/** A stored amount as the amount field shows it, e.g. 1500.5 -> "1.500,5" in id-ID. */
export function amountToInput(amount: number, locale?: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(amount)
}

/** Parses the output of formatAmountInput. Returns NaN for empty input. */
export function parseAmountInput(text: string, locale?: string): number {
  const { group, decimal } = separators(locale)
  const normalized = text.split(group).join('').replace(decimal, '.')
  return normalized === '' ? NaN : Number(normalized)
}
