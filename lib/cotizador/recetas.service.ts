import { and, asc, eq, isNull, ne } from 'drizzle-orm'
import { db } from '@/db'
import { clientes, cotizadorConfig, insumos, recetas, recetaItems } from '@/db/schema'
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors'
import { calcularCostoUnitario, type DesgloseCosto, type InsumoPrecio } from '@/lib/costos/calculo'
import { COTIZADOR_CONFIG_DEFAULTS } from '@/lib/cotizador/snapshot'
import { validarItemsReceta } from '@/lib/cotizador/validar-items'
import type { CreateRecetaInput, DuplicarRecetaInput, UpdateRecetaInput } from '@/lib/validations/cotizador'

// Servicio de recetas del admin. Desde FASE 1C las recetas ya no son "una por
// gramaje": tienen nombre, dueño (general o cliente), packaging propio y
// margen opcional. Cada receta se devuelve con su desglose de costo
// (lib/costos/calculo.ts).

type RecetaItemRow = typeof recetaItems.$inferSelect & { insumo: typeof insumos.$inferSelect }
export type RecetaConCosto = typeof recetas.$inferSelect & {
  items: RecetaItemRow[]
  cliente: Pick<typeof clientes.$inferSelect, 'id' | 'nombre' | 'apellido'> | null
  costo: DesgloseCosto
}

const CON_RELACIONES = {
  items: { with: { insumo: true as const } },
  cliente: { columns: { id: true as const, nombre: true as const, apellido: true as const } },
}

// Pura: desglose de costo de una fila de receta con sus items.
// cantidad es la columna nueva (FASE 1A); si una fila vieja aún no la tiene,
// cae a gramos (mismo valor por backfill).
export function costoDeReceta(
  receta: {
    items: { insumoId: string; cantidad: string | null; gramos: string }[]
    bobinaInsumoId: string | null
    cajaInsumoId: string | null
    alfajoresPorCaja: number | null
  },
  precios: Map<string, InsumoPrecio>,
  alfajoresPorCajaDefault: number,
): DesgloseCosto {
  return calcularCostoUnitario({
    items: receta.items.map((i) => ({ insumoId: i.insumoId, cantidad: Number(i.cantidad ?? i.gramos) })),
    bobinaInsumoId: receta.bobinaInsumoId,
    cajaInsumoId: receta.cajaInsumoId,
    alfajoresPorCaja: receta.alfajoresPorCaja ?? alfajoresPorCajaDefault,
  }, precios)
}

async function contextoCosto() {
  const activos = await db.select().from(insumos).where(eq(insumos.activo, true))
  const precios = new Map<string, InsumoPrecio>(
    activos.map((i) => [i.id, { id: i.id, nombre: i.nombre, unidad: i.unidad, precio: Number(i.precio) }]),
  )
  const [config] = await db.select().from(cotizadorConfig).where(eq(cotizadorConfig.id, 1)).limit(1)
  return { precios, alfajoresDefault: config?.alfajoresPorCaja ?? COTIZADOR_CONFIG_DEFAULTS.alfajoresPorCaja }
}

export async function listarRecetas(
  filtros: { clienteId?: string; esCotizador?: boolean; generales?: boolean },
): Promise<RecetaConCosto[]> {
  const condiciones = []
  if (filtros.clienteId) condiciones.push(eq(recetas.clienteId, filtros.clienteId))
  if (filtros.esCotizador) condiciones.push(eq(recetas.esCotizador, true))
  if (filtros.generales) condiciones.push(isNull(recetas.clienteId))
  const rows = await db.query.recetas.findMany({
    where: condiciones.length > 0 ? and(...condiciones) : undefined,
    with: CON_RELACIONES,
    orderBy: [asc(recetas.gramaje), asc(recetas.nombre)],
  })
  const { precios, alfajoresDefault } = await contextoCosto()
  return rows.map((r) => ({ ...r, costo: costoDeReceta(r, precios, alfajoresDefault) }))
}

export async function obtenerReceta(id: string): Promise<RecetaConCosto> {
  const row = await db.query.recetas.findFirst({ where: eq(recetas.id, id), with: CON_RELACIONES })
  if (!row) throw new NotFoundError('Receta')
  const { precios, alfajoresDefault } = await contextoCosto()
  return { ...row, costo: costoDeReceta(row, precios, alfajoresDefault) }
}

// 409 si ya hay otra receta ACTIVA del cotizador con ese gramaje: espejo en
// aplicación del índice único parcial recetas_gramaje_cotizador_unique_idx.
async function verificarGramajeCotizadorLibre(gramaje: number, excluirId?: string): Promise<void> {
  const cond = [eq(recetas.gramaje, gramaje), eq(recetas.esCotizador, true), eq(recetas.activo, true)]
  if (excluirId) cond.push(ne(recetas.id, excluirId))
  const otra = await db.query.recetas.findFirst({ where: and(...cond), columns: { id: true } })
  if (otra) throw new ConflictError(`Ya existe una receta activa del cotizador de ${gramaje} g`)
}

async function verificarClienteExiste(clienteId: string): Promise<void> {
  const row = await db.query.clientes.findFirst({
    where: and(eq(clientes.id, clienteId), isNull(clientes.deletedAt)),
    columns: { id: true },
  })
  if (!row) throw new ValidationError('El cliente no existe')
}

function filasItems(recetaId: string, items: { insumoId: string; cantidad: number }[]) {
  // cantidad es la columna nueva; gramos se sigue escribiendo con el mismo
  // valor mientras la columna exista (compatibilidad FASE 1A)
  return items.map((i) => ({
    recetaId,
    insumoId: i.insumoId,
    cantidad: i.cantidad.toFixed(4),
    gramos: i.cantidad.toFixed(2),
  }))
}

export async function crearReceta(input: CreateRecetaInput): Promise<RecetaConCosto> {
  if (input.clienteId) await verificarClienteExiste(input.clienteId)
  await validarItemsReceta(input.items)
  if (input.esCotizador) await verificarGramajeCotizadorLibre(input.gramaje)

  const id = await db.transaction(async (tx) => {
    const [nueva] = await tx.insert(recetas).values({
      nombre: input.nombre,
      gramaje: input.gramaje,
      clienteId: input.clienteId,
      esCotizador: input.esCotizador,
      bobinaInsumoId: input.bobinaInsumoId,
      cajaInsumoId: input.cajaInsumoId,
      alfajoresPorCaja: input.alfajoresPorCaja,
      margenPct: input.margenPct === null ? null : input.margenPct.toFixed(2),
    }).returning({ id: recetas.id })
    if (input.items.length > 0) {
      await tx.insert(recetaItems).values(filasItems(nueva!.id, input.items))
    }
    return nueva!.id
  })
  return obtenerReceta(id)
}

export async function actualizarReceta(id: string, input: UpdateRecetaInput): Promise<RecetaConCosto> {
  const actual = await db.query.recetas.findFirst({ where: eq(recetas.id, id) })
  if (!actual) throw new NotFoundError('Receta')

  // Estado EFECTIVO post-PATCH: el cruce esCotizador × clienteId y el gramaje
  // único del cotizador se validan contra lo que quedaría, no contra el
  // payload aislado.
  const ef = {
    gramaje: input.gramaje ?? actual.gramaje,
    clienteId: input.clienteId !== undefined ? input.clienteId : actual.clienteId,
    esCotizador: input.esCotizador ?? actual.esCotizador,
    activo: input.activo ?? actual.activo,
  }
  if (ef.esCotizador && ef.clienteId !== null) {
    throw new ValidationError('Una receta del cotizador no puede pertenecer a un cliente')
  }
  if (ef.clienteId && ef.clienteId !== actual.clienteId) await verificarClienteExiste(ef.clienteId)
  if (input.items) await validarItemsReceta(input.items)
  if (ef.esCotizador && ef.activo) await verificarGramajeCotizadorLibre(ef.gramaje, id)

  await db.transaction(async (tx) => {
    const { items, margenPct, ...campos } = input
    await tx.update(recetas).set({
      ...campos,
      ...(margenPct !== undefined
        ? { margenPct: margenPct === null ? null : margenPct.toFixed(2) }
        : {}),
      updatedAt: new Date(),
    }).where(eq(recetas.id, id))
    // items reemplaza la lista completa de componentes
    if (items) {
      await tx.delete(recetaItems).where(eq(recetaItems.recetaId, id))
      if (items.length > 0) await tx.insert(recetaItems).values(filasItems(id, items))
    }
  })
  return obtenerReceta(id)
}

// Clona la receta origen con items, packaging y margen para un cliente.
// La copia SIEMPRE nace con esCotizador = false.
export async function duplicarReceta(id: string, input: DuplicarRecetaInput): Promise<RecetaConCosto> {
  const origen = await db.query.recetas.findFirst({ where: eq(recetas.id, id), with: { items: true } })
  if (!origen) throw new NotFoundError('Receta')
  await verificarClienteExiste(input.clienteId)

  const nuevaId = await db.transaction(async (tx) => {
    const [nueva] = await tx.insert(recetas).values({
      nombre: input.nombre,
      gramaje: origen.gramaje,
      clienteId: input.clienteId,
      esCotizador: false,
      bobinaInsumoId: origen.bobinaInsumoId,
      cajaInsumoId: origen.cajaInsumoId,
      alfajoresPorCaja: origen.alfajoresPorCaja,
      margenPct: origen.margenPct,
    }).returning({ id: recetas.id })
    if (origen.items.length > 0) {
      await tx.insert(recetaItems).values(origen.items.map((i) => ({
        recetaId: nueva!.id,
        insumoId: i.insumoId,
        gramos: i.gramos,
        cantidad: i.cantidad ?? i.gramos,
      })))
    }
    return nueva!.id
  })
  return obtenerReceta(nuevaId)
}
