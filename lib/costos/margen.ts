import { ValidationError } from '@/lib/errors'
import { round2 } from '@/lib/costos/calculo'

// Resolución de margen en cascada y derivación de precio desde costo.
// Todos los pct son porcentajes (35 = 35%), no fracciones.

export type OrigenMargen = 'receta' | 'lista' | 'global'

// Primer valor NO NULO en la cascada receta → lista → global. Un margen 0 es
// válido: por eso se compara con != null y no por truthiness.
export function resolverMargen(
  recetaMargenPct: number | null | undefined,
  listaMargenPct: number | null | undefined,
  configMargenPct: number,
): { valor: number; origen: OrigenMargen } {
  if (recetaMargenPct != null) return { valor: recetaMargenPct, origen: 'receta' }
  if (listaMargenPct != null) return { valor: listaMargenPct, origen: 'lista' }
  return { valor: configMargenPct, origen: 'global' }
}

// Margen sobre venta: neto = costo / (1 − margen). Los tres campos se derivan
// con precisión completa y se redondean a 2 decimales recién al exponer.
export function precioDesdeCosto(
  costo: number,
  margenPct: number,
  ivaPct: number,
): { neto: number; iva: number; final: number } {
  if (margenPct >= 100) {
    throw new ValidationError('El margen debe ser menor a 100%')
  }
  const neto = costo / (1 - margenPct / 100)
  const iva = neto * (ivaPct / 100)
  return { neto: round2(neto), iva: round2(iva), final: round2(neto + iva) }
}
