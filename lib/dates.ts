/**
 * Date utilities for Argentina timezone (America/Argentina/Buenos_Aires = UTC-3, no DST).
 *
 * Problem solved: JavaScript's `new Date("2026-05-28")` parses as midnight UTC.
 * In Argentina (UTC-3) that becomes 21:00 of the PREVIOUS day, so date-fns
 * (which uses local timezone) would display "27/05" instead of "28/05".
 *
 * Strategy: format "business date" fields by extracting the UTC date portion
 * directly (avoiding any timezone shift), then render with Intl.DateTimeFormat.
 */

const AR_TZ = 'America/Argentina/Buenos_Aires'

/**
 * Today's date in Argentina as YYYY-MM-DD.
 * Replaces `new Date().toISOString().split('T')[0]` which returns UTC date.
 * At 22:00 AR time the UTC date is already the next day — this returns
 * the correct AR calendar date regardless of clock time.
 */
export function todayStrAR(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: AR_TZ }).format(new Date())
}

/**
 * Argentina date N calendar days from now, as YYYY-MM-DD.
 * Replaces `format(addDays(new Date(), n), 'yyyy-MM-dd')` from date-fns.
 */
export function addDaysStrAR(days: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: AR_TZ }).format(
    new Date(Date.now() + days * 24 * 60 * 60 * 1000),
  )
}

/**
 * Formats a "business date" (stored as date-only / midnight UTC) for display
 * in dd/MM/yyyy or dd/MM/yy format.
 *
 * Reads the ISO string's UTC date portion directly instead of converting via
 * `new Date()` — this prevents the midnight-UTC → yesterday-in-Argentina
 * timezone shift that occurs when date-fns formats in local time.
 *
 * Replaces: `format(new Date(x), 'dd/MM/yyyy')` / `'dd/MM/yy'` from date-fns.
 *
 * @param date  Date instance or ISO string from the API
 * @param corto true → 2-digit year (dd/MM/yy); false (default) → 4-digit (dd/MM/yyyy)
 */
export function formatFechaAR(date: Date | string, corto = false): string {
  // Extract "YYYY-MM-DD" from the ISO string so we use the stored date portion,
  // not the local-time reinterpretation.  Placing it at noon UTC ensures the
  // same calendar day renders in any timezone.
  const iso = typeof date === 'string' ? date : date.toISOString()
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const noon = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0))
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: AR_TZ,
    day: '2-digit',
    month: '2-digit',
    year: corto ? '2-digit' : 'numeric',
  }).format(noon)
}

/**
 * Formats an *instant* (timestamp with a real time-of-day) as a calendar date in
 * Argentina, in dd/MM/yyyy or dd/MM/yy format.
 *
 * Use this for `pedidos.fecha` and any column stored as a real instant
 * (e.g. created via `new Date()`), NOT for "business date" / midnight-UTC fields
 * (use {@link formatFechaAR} for those).
 *
 * Unlike `formatFechaAR` — which reads the raw UTC date portion — this converts
 * the instant to the Argentina timezone first. A pedido created at 23:30 AR
 * (= 02:30 UTC next day) renders as the AR calendar day, not the UTC one, and
 * does so identically on every device regardless of the device timezone.
 *
 * @param value Date instance or ISO string from the API
 * @param corto true → 2-digit year (dd/MM/yy); false (default) → 4-digit (dd/MM/yyyy)
 */
export function formatFechaInstanteAR(value: Date | string, corto = false): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: AR_TZ,
    day: '2-digit',
    month: '2-digit',
    year: corto ? '2-digit' : 'numeric',
  }).format(new Date(value))
}

/**
 * YYYY-MM-DD of an *instant* expressed in Argentina time. Use to prefill
 * `<input type="date">` from a stored instant so the prefilled value matches
 * what {@link formatFechaInstanteAR} renders.
 */
export function fechaISO_AR(value: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: AR_TZ }).format(new Date(value))
}

/**
 * Parses a date-only string (YYYY-MM-DD) as midnight in Argentina (= 03:00 UTC).
 * Use in API route handlers instead of `new Date(fechaStr)`.
 *
 * `new Date("2026-05-28")` → 2026-05-28T00:00:00Z (midnight UTC = 21:00 AR prev day).
 * `parseFechaAR("2026-05-28")` → 2026-05-28T03:00:00Z (midnight AR = correct).
 */
export function parseFechaAR(fechaStr: string): Date {
  const [y, m, d] = fechaStr.split('-').map(Number)
  // Argentina = UTC-3 → midnight AR = 03:00 UTC
  return new Date(Date.UTC(y!, m! - 1, d!, 3, 0, 0, 0))
}
