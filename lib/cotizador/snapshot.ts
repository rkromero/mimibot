import { eq, asc } from 'drizzle-orm'
import { db } from '@/db'
import { insumos, recetas, cotizadorConfig, escalonesVolumen } from '@/db/schema'
import { ValidationError } from '@/lib/errors'
import type { CotizadorSnapshot, RecetaSnapshotItem } from '@/lib/cotizador/calculo'

// Defaults cuando el singleton cotizador_config todavía no fue guardado
export const COTIZADOR_CONFIG_DEFAULTS = {
  margenPct: 0,
  cargoSetupPersonalizado: 0,
  alfajoresPorCaja: 12,
  validezDias: 7,
  topeDescuentoPct: 0,
  condicionesComerciales: null as string | null,
}

// Arma el snapshot de parámetros que consume calcularCotizacion(). Congela
// precios y config al momento de cotizar: la cotización no cambia si después
// se editan insumos o márgenes.
export async function armarSnapshotCotizador(): Promise<CotizadorSnapshot> {
  const [config] = await db
    .select()
    .from(cotizadorConfig)
    .where(eq(cotizadorConfig.id, 1))
    .limit(1)

  const insumosActivos = await db
    .select()
    .from(insumos)
    .where(eq(insumos.activo, true))

  const bobina = insumosActivos.find((i) => i.tipo === 'bobina' && i.unidad === 'unidad')
  const caja = insumosActivos.find((i) => i.tipo === 'caja' && i.unidad === 'unidad')
  if (!bobina) throw new ValidationError('Falta un insumo activo de tipo bobina (por unidad)')
  if (!caja) throw new ValidationError('Falta un insumo activo de tipo caja (por unidad)')

  const insumosKg = new Map(
    insumosActivos.filter((i) => i.unidad === 'kg').map((i) => [i.id, Number(i.precio)]),
  )

  const recetasActivas = await db.query.recetas.findMany({
    where: eq(recetas.activo, true),
    with: { items: true },
  })

  const recetasPorGramaje: Record<number, RecetaSnapshotItem[]> = {}
  for (const receta of recetasActivas) {
    const items = receta.items.flatMap((item) => {
      const precioPorKg = insumosKg.get(item.insumoId)
      // Componentes de insumos inactivos o no-kg no participan del costo
      if (precioPorKg === undefined) return []
      return [{ gramos: Number(item.gramos), precioPorKg }]
    })
    recetasPorGramaje[receta.gramaje] = items
  }

  const escalones = await db
    .select()
    .from(escalonesVolumen)
    .orderBy(asc(escalonesVolumen.orden))

  return {
    margenPct: config ? Number(config.margenPct) : COTIZADOR_CONFIG_DEFAULTS.margenPct,
    cargoSetupPersonalizado: config
      ? Number(config.cargoSetupPersonalizado)
      : COTIZADOR_CONFIG_DEFAULTS.cargoSetupPersonalizado,
    alfajoresPorCaja: config?.alfajoresPorCaja ?? COTIZADOR_CONFIG_DEFAULTS.alfajoresPorCaja,
    topeDescuentoPct: config
      ? Number(config.topeDescuentoPct)
      : COTIZADOR_CONFIG_DEFAULTS.topeDescuentoPct,
    validezDias: config?.validezDias ?? COTIZADOR_CONFIG_DEFAULTS.validezDias,
    condicionesComerciales: config
      ? config.condicionesComerciales
      : COTIZADOR_CONFIG_DEFAULTS.condicionesComerciales,
    precioBobinaUnit: Number(bobina.precio),
    precioCajaUnit: Number(caja.precio),
    recetas: recetasPorGramaje,
    escalones: escalones.map((e) => ({
      cantidadMin: e.cantidadMin,
      cantidadMax: e.cantidadMax,
      descuentoPct: Number(e.descuentoPct),
    })),
  }
}
