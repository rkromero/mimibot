import { eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { cotizadorConfig, insumos, productos, recetas } from '@/db/schema'
import { calcularCostoUnitario, round2, type DesgloseCosto, type InsumoPrecio } from '@/lib/costos/calculo'
import { precioDesdeCosto, resolverMargen, type OrigenMargen } from '@/lib/costos/margen'
import { COTIZADOR_CONFIG_DEFAULTS } from '@/lib/cotizador/snapshot'

// Costeo de productos enlazados a receta (FASE 1D). El costo del producto es
// el de su receta, calculado en vivo con lib/costos; el margen se resuelve con
// la cascada de lib/costos/margen (el margen del producto pisa al de la receta
// y entra por el slot "receta"; la capa de lista llega en Fase 2). El precio
// guardado del producto se trata como NETO (sin IVA), igual que el margen
// sobre venta.

export type CosteoProducto = {
  costoUnitario: number
  desglose: DesgloseCosto
  margen: { valor: number; origen: OrigenMargen }
  precioSugeridoNeto: number
  precioSugeridoFinal: number
  /** % del precio guardado vs el sugerido neto (+5 = 5% por encima) */
  diferenciaPrecioPct: number
}

type ProductoRow = typeof productos.$inferSelect

export async function obtenerMargenGlobal(): Promise<number> {
  const [config] = await db.select().from(cotizadorConfig).where(eq(cotizadorConfig.id, 1)).limit(1)
  return config ? Number(config.margenPct) : COTIZADOR_CONFIG_DEFAULTS.margenPct
}

// Calcula el costeo de los productos con receta y persiste costoCalculado /
// costoActualizadoAt cuando el recálculo cambió el valor. Un producto cuya
// receta o margen quede en un estado inválido se saltea (sin costeo) en vez
// de romper el listado.
export async function costearProductos(rows: ProductoRow[]): Promise<Map<string, CosteoProducto>> {
  const out = new Map<string, CosteoProducto>()
  const conReceta = rows.filter((p) => p.recetaId !== null)
  if (conReceta.length === 0) return out

  const recetaIds = [...new Set(conReceta.map((p) => p.recetaId as string))]
  const recetasRows = await db.query.recetas.findMany({
    where: inArray(recetas.id, recetaIds),
    with: { items: true },
  })
  const recetasPorId = new Map(recetasRows.map((r) => [r.id, r]))

  const activos = await db.select().from(insumos).where(eq(insumos.activo, true))
  const precios = new Map<string, InsumoPrecio>(
    activos.map((i) => [i.id, { id: i.id, nombre: i.nombre, unidad: i.unidad, precio: Number(i.precio) }]),
  )
  const [config] = await db.select().from(cotizadorConfig).where(eq(cotizadorConfig.id, 1)).limit(1)
  const margenGlobal = config ? Number(config.margenPct) : COTIZADOR_CONFIG_DEFAULTS.margenPct
  const alfajoresDefault = config?.alfajoresPorCaja ?? COTIZADOR_CONFIG_DEFAULTS.alfajoresPorCaja

  const cambios: { id: string; costo: string }[] = []
  for (const p of conReceta) {
    const receta = recetasPorId.get(p.recetaId as string)
    if (!receta) continue
    try {
      const desglose = calcularCostoUnitario({
        items: receta.items.map((i) => ({ insumoId: i.insumoId, cantidad: Number(i.cantidad ?? i.gramos) })),
        bobinaInsumoId: receta.bobinaInsumoId,
        cajaInsumoId: receta.cajaInsumoId,
        alfajoresPorCaja: receta.alfajoresPorCaja ?? alfajoresDefault,
      }, precios)

      const margenProducto = p.margenPct != null ? Number(p.margenPct) : null
      const margenReceta = receta.margenPct != null ? Number(receta.margenPct) : null
      const margen = resolverMargen(margenProducto ?? margenReceta, null, margenGlobal)
      const sugerido = precioDesdeCosto(desglose.costoUnitario, margen.valor, Number(p.ivaPct))

      const precioGuardado = Number(p.precio)
      const diferenciaPrecioPct = sugerido.neto > 0
        ? round2(((precioGuardado - sugerido.neto) / sugerido.neto) * 100)
        : 0

      out.set(p.id, {
        costoUnitario: desglose.costoUnitario,
        desglose,
        margen,
        precioSugeridoNeto: sugerido.neto,
        precioSugeridoFinal: sugerido.final,
        diferenciaPrecioPct,
      })

      const costoStr = desglose.costoUnitario.toFixed(2)
      if (p.costoCalculado !== costoStr) cambios.push({ id: p.id, costo: costoStr })
    } catch {
      // margen >= 100 o alfajoresPorCaja inválido en datos viejos: sin costeo
    }
  }

  for (const c of cambios) {
    await db.update(productos)
      .set({ costoCalculado: c.costo, costoActualizadoAt: new Date() })
      .where(eq(productos.id, c.id))
  }
  return out
}

export async function costearProducto(p: ProductoRow): Promise<CosteoProducto | null> {
  const map = await costearProductos([p])
  return map.get(p.id) ?? null
}
