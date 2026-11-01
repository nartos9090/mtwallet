/** Formats an amount, showing decimals only when it has them (IDR rarely does). */
export function formatMoney(amount: number, currency: string, locale?: string): string {
  // Sums of amounts with cents pick up floating-point noise (0.1 + 0.2): round to cents first.
  amount = Math.round(amount * 100) / 100
  const digits = Number.isInteger(amount) ? 0 : 2
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount)
}

/** Short form for tiles and labels: "IDR 92.5M", "Rp 92,5 jt". */
export function formatMoneyCompact(amount: number, currency: string, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
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

/** formatAmountInput keeping a leading minus (balances can be negative). Accepts "-" and "−". */
export function formatSignedAmountInput(text: string, locale?: string): string {
  const negative = /^\s*[-−]/.test(text)
  return (negative ? '-' : '') + formatAmountInput(text.replace(/[-−]/g, ''), locale)
}

/** amountToInput with the sign written as "-" (some locales format negatives with "−"). */
export function signedAmountToInput(amount: number, locale?: string): string {
  return (amount < 0 ? '-' : '') + amountToInput(Math.abs(amount), locale)
}

/** Parses the output of formatSignedAmountInput. Returns NaN for empty input. */
export function parseSignedAmountInput(text: string, locale?: string): number {
  const amount = parseAmountInput(text.replace('-', ''), locale)
  return text.startsWith('-') ? -amount : amount
}

/** Parses the output of formatAmountInput. Returns NaN for empty input. */
export function parseAmountInput(text: string, locale?: string): number {
  const { group, decimal } = separators(locale)
  const normalized = text.split(group).join('').replace(decimal, '.')
  return normalized === '' ? NaN : Number(normalized)
}
