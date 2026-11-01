import { CalendarDays, Clock } from 'lucide-react'
import { useState } from 'react'
import { Chip } from '@/components/Chip'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { WheelPicker, type WheelPickerOption, WheelPickerWrapper } from '@/components/ui/wheel-picker'
import { weekStartsOn } from '@/lib/locale'

/** Day and month names follow the phone's language through Intl, so no date-fns locales are bundled. */
const formatters = {
  formatCaption: (date: Date) => date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
  formatWeekdayName: (date: Date) => date.toLocaleDateString(undefined, { weekday: 'narrow' }),
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function sameDay(a: Date, b: Date) {
  return startOfDay(a).getTime() === startOfDay(b).getTime()
}

/** `date` (epoch ms) with its day replaced, keeping the time of day. */
function withDay(date: number, day: Date) {
  const d = new Date(date)
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), d.getHours(), d.getMinutes()).getTime()
}

/** Whether the phone shows 12-hour time (with AM/PM). */
const uses12Hour = ['h11', 'h12'].includes(new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle ?? '')
const pad = (n: number) => String(n).padStart(2, '0')
const option = (value: number, label: string): WheelPickerOption<number> => ({ value, label })
const HOURS = uses12Hour
  ? Array.from({ length: 12 }, (_, i) => option(i + 1, String(i + 1)))
  : Array.from({ length: 24 }, (_, i) => option(i, pad(i)))
const MINUTES = Array.from({ length: 60 }, (_, i) => option(i, pad(i)))
/** AM/PM in the phone's language. */
const PERIODS = [9, 21].map((hour, i) =>
  option(
    i,
    new Intl.DateTimeFormat(undefined, { hour: 'numeric', hour12: true })
      .formatToParts(new Date(2020, 0, 1, hour))
      .find((p) => p.type === 'dayPeriod')?.value ?? (i ? 'PM' : 'AM'),
  ),
)

/** Hour and minute wheels (plus AM/PM on 12-hour phones) in a popover. */
function TimePicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const date = new Date(value)
  const hours = date.getHours()
  const setTime = (h: number, m: number) =>
    onChange(new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m).getTime())
  const isPm = hours >= 12

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Chip selected={false} icon={<Clock className="size-4" />} aria-label="Time">
          {date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </Chip>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        {/* The wheels share this width equally. */}
        <WheelPickerWrapper className={uses12Hour ? 'w-56' : 'w-40'}>
          <WheelPicker<number>
            options={HOURS}
            value={uses12Hour ? hours % 12 || 12 : hours}
            onValueChange={(h) => setTime(uses12Hour ? (h % 12) + (isPm ? 12 : 0) : h, date.getMinutes())}
            infinite
          />
          <WheelPicker<number>
            options={MINUTES}
            value={date.getMinutes()}
            onValueChange={(m) => setTime(hours, m)}
            infinite
          />
          {uses12Hour && (
            <WheelPicker<number>
              options={PERIODS}
              value={isPm ? 1 : 0}
              onValueChange={(pm) => setTime((hours % 12) + (pm ? 12 : 0), date.getMinutes())}
            />
          )}
        </WheelPickerWrapper>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 w-full"
          onClick={() => {
            const now = new Date()
            setTime(now.getHours(), now.getMinutes())
          }}
        >
          Now
        </Button>
      </PopoverContent>
    </Popover>
  )
}

/** Quick picks for today and yesterday, a calendar for any other day, and the time. */
export function DateTimeField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [open, setOpen] = useState(false)
  const [today] = useState(() => startOfDay(new Date()))
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  const date = new Date(value)
  const isOtherDay = !sameDay(date, today) && !sameDay(date, yesterday)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip selected={sameDay(date, today)} onClick={() => onChange(withDay(value, today))}>
        Today
      </Chip>
      <Chip selected={sameDay(date, yesterday)} onClick={() => onChange(withDay(value, yesterday))}>
        Yesterday
      </Chip>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Chip selected={isOtherDay} icon={<CalendarDays className="size-4" />}>
            {isOtherDay
              ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
              : 'Other day'}
          </Chip>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            defaultMonth={date}
            weekStartsOn={weekStartsOn()}
            formatters={formatters}
            onSelect={(day) => {
              if (day) onChange(withDay(value, day))
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      <TimePicker value={value} onChange={onChange} />
    </div>
  )
}
