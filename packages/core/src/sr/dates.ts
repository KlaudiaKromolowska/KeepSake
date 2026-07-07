function dayFormatter(timeZone: string): Intl.DateTimeFormat {
  // en-CA formats as YYYY-MM-DD, matching our calendar-day string shape.
  return new Intl.DateTimeFormat("en-CA", { timeZone });
}

/** Calendar day ("YYYY-MM-DD") of an epoch-ms instant in an IANA timezone. */
export function calendarDayInTz(epochMs: number, timeZone: string): string {
  return dayFormatter(timeZone).format(new Date(epochMs));
}

/** True when two instants fall on different calendar days in the given timezone. */
export function isDistinctDay(aMs: number, bMs: number, timeZone: string): boolean {
  return calendarDayInTz(aMs, timeZone) !== calendarDayInTz(bMs, timeZone);
}
