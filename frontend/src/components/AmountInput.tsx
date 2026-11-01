import { Button } from '@/components/ui/button'
import { formatAmountInput, formatSignedAmountInput } from '@/core/money'
import { useSettings } from '@/hooks/useWallet'
import { cn } from '@/lib/utils'

/**
 * Money entry: the currency in front, digits grouped as you type
 * ("1.500.000" in id-ID). `signed` allows negatives and adds a ± button,
 * since number keypads often have no minus key.
 */
export function AmountInput({
  id,
  value,
  onChange,
  signed = false,
  size = 'lg',
  autoFocus,
  label = 'Amount',
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  signed?: boolean
  size?: 'lg' | 'md'
  autoFocus?: boolean
  label?: string
}) {
  const currency = useSettings()?.currency
  const format = signed ? formatSignedAmountInput : formatAmountInput
  return (
    <div className="flex items-baseline gap-2 border-b pb-2">
      <span className="text-muted-foreground">{currency}</span>
      <input
        id={id}
        aria-label={label}
        inputMode="decimal"
        placeholder="0"
        autoFocus={autoFocus}
        className={cn(
          'w-full min-w-0 bg-transparent font-semibold tabular-nums outline-none',
          size === 'lg' ? 'text-4xl' : 'text-2xl',
        )}
        value={value}
        onChange={(e) => onChange(format(e.target.value))}
      />
      {signed && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-center"
          aria-label="Switch between positive and negative"
          onClick={() => onChange(value.startsWith('-') ? value.slice(1) : `-${value}`)}
        >
          ±
        </Button>
      )}
    </div>
  )
}
