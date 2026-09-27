/** Formateo compartido de los bloques del Tablero de comando. */

export function money(v: number, decimales = 0): string {
  return `$${v.toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}`
}

export function pct(v: number | null | undefined, decimales = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return `${(v * 100).toFixed(decimales)}%`
}

/** "+12,3%" / "−8,1%" contra el mes anterior; null sin base. */
export function deltaTexto(actual: number, anterior: number): string | null {
  if (!Number.isFinite(anterior) || anterior === 0) return null
  const d = ((actual - anterior) / Math.abs(anterior)) * 100
  return `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}%`
}

export const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  mercadopago: 'Mercado Pago',
  'sin especificar': 'Sin especificar',
}
