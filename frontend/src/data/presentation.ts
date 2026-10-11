/** Consistent display text; source names and meal IDs remain available for matching. */
export function dishName(name: string): string {
  return name.replace(/\s*\|\s*/g, ' ').replace(/\s+/g, ' ').trim().toLocaleUpperCase('de-CH');
}

export function formatMenuDay(date: string, language: 'en' | 'de' = 'en'): string {
  return new Intl.DateTimeFormat(language === 'de' ? 'de-CH' : 'en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`)).replace(/,/g, '');
}
