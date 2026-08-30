import { inArray } from 'drizzle-orm'
import { db } from '@/db'
import { insumos } from '@/db/schema'
import { ValidationError } from '@/lib/errors'

// Verifica que los items de una receta apunten a insumos existentes y sin
// repetidos. Desde FASE 1C la receta admite cualquier unidad ('kg' con
// cantidad en gramos, 'unidad' con cantidad en unidades); la bobina y la caja
// del packaging van aparte en bobinaInsumoId / cajaInsumoId.
export async function validarItemsReceta(items: { insumoId: string }[]): Promise<void> {
  if (items.length === 0) return
  const ids = [...new Set(items.map((i) => i.insumoId))]
  if (ids.length !== items.length) {
    throw new ValidationError('Hay insumos repetidos en la receta')
  }
  const rows = await db
    .select({ id: insumos.id })
    .from(insumos)
    .where(inArray(insumos.id, ids))
  if (rows.length !== ids.length) {
    throw new ValidationError('Hay insumos inexistentes en la receta')
  }
}
