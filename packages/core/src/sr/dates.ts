const dayFormatterCache = new Map<string, Intl.DateTimeFormat>();

function dayFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = dayFormatterCache.get(timeZone);
  if (cached) return cached;
  // en-CA formats as YYYY-MM-DD, matching our calendar-day string shape.
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone });
  dayFormatterCache.set(timeZone, formatter);
  return formatter;
}

/** Calendar day ("YYYY-MM-DD") of an epoch-ms instant in an IANA timezone. */
export function calendarDayInTz(epochMs: number, timeZone: string): string {
  return dayFormatter(timeZone).format(new Date(epochMs));
}

/** True when two instants fall on different calendar days in the given timezone. */
export function isDistinctDay(aMs: number, bMs: number, timeZone: string): boolean {
  return calendarDayInTz(aMs, timeZone) !== calendarDayInTz(bMs, timeZone);
}
