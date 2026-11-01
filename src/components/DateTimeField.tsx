import { CalendarDays } from 'lucide-react'
import { useState } from 'react'
import { Chip } from '@/components/Chip'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/** Day and month names follow the phone's language through Intl, so no date-fns locales are bundled. */
const formatters = {
  formatCaption: (date: Date) => date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
  formatWeekdayName: (date: Date) => date.toLocaleDateString(undefined, { weekday: 'narrow' }),
}

/** First day of the week for the phone's region (1 = Monday ... 7 = Sunday in Intl, 0 = Sunday in DayPicker). */
function weekStartsOn(): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
    getWeekInfo?: () => { firstDay: number }
    weekInfo?: { firstDay: number }
  }
  const firstDay = (locale.getWeekInfo?.() ?? locale.weekInfo)?.firstDay ?? 1
  return (firstDay % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6
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

/** Quick picks for today and yesterday, a calendar for any other day, and the time. */
export function DateTimeField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [open, setOpen] = useState(false)
  const [today] = useState(() => startOfDay(new Date()))
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  const date = new Date(value)
  const isOtherDay = !sameDay(date, today) && !sameDay(date, yesterday)
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

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
      <Input
        type="time"
        aria-label="Time"
        className="w-36"
        value={time}
        onChange={(e) => {
          const [hours, minutes] = e.target.value.split(':').map(Number)
          if (Number.isNaN(hours)) return
          onChange(new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes).getTime())
        }}
      />
    </div>
  )
}
