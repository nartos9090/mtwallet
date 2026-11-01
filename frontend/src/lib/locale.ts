/** First day of the week for the phone's region, as JS days (0 = Sunday). */
export function weekStartsOn(): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
    getWeekInfo?: () => { firstDay: number }
    weekInfo?: { firstDay: number }
  }
  // Intl counts 1 = Monday ... 7 = Sunday.
  const firstDay = (locale.getWeekInfo?.() ?? locale.weekInfo)?.firstDay ?? 1
  return (firstDay % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6
}
