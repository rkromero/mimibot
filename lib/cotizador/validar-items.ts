import { inArray } from 'drizzle-orm'
import { db } from '@/db'
import { insumos } from '@/db/schema'
import { ValidationError } from '@/lib/errors'

// Verifica que todos los items de una receta apunten a insumos con unidad
// 'kg' (los de unidad 'unidad' no van en la receta: entran directo en la
// fórmula — bobina por alfajor, caja prorrateada)
export async function validarItemsKg(items: { insumoId: string }[]): Promise<void> {
  if (items.length === 0) return
  const ids = [...new Set(items.map((i) => i.insumoId))]
  if (ids.length !== items.length) {
    throw new ValidationError('Hay insumos repetidos en la receta')
  }
  const rows = await db
    .select({ id: insumos.id, unidad: insumos.unidad })
    .from(insumos)
    .where(inArray(insumos.id, ids))
  if (rows.length !== ids.length) {
    throw new ValidationError('Hay insumos inexistentes en la receta')
  }
  const noKg = rows.find((r) => r.unidad !== 'kg')
  if (noKg) {
    throw new ValidationError('La receta solo admite insumos por kg (bobina y caja van aparte)')
  }
}
