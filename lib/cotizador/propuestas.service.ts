import { sql, eq, and, isNull, desc } from 'drizzle-orm'
import { db } from '@/db'
import { documentCounters, propuestas } from '@/db/schema'
import { armarSnapshotCotizador } from '@/lib/cotizador/snapshot'
import { calcularEscenarios, type EscenarioCotizacion } from '@/lib/cotizador/escenarios'
import { addDaysStrAR } from '@/lib/dates'
import type { CotizacionInput } from '@/lib/cotizador/calculo'

export type Propuesta = typeof propuestas.$inferSelect

export type PropuestaResumen = {
  id: string
  numero: number
  fecha: Date
  cantidad: number
  gramaje: number
  estado: Propuesta['estado']
  vigenteHasta: string
  total: number
}

// Crea la propuesta congelando snapshot (parámetros vigentes) y resultado
// (los 3 escenarios calculados). El número correlativo sale de
// document_counters con lock FOR UPDATE, igual que remitos y proformas.
// Si el descuento manual supera el tope, nace en pendiente_aprobacion.
export async function crearPropuesta(
  leadId: string,
  input: CotizacionInput,
  creadoPor: string,
): Promise<Propuesta> {
  const snapshot = await armarSnapshotCotizador()
  const escenarios = calcularEscenarios(input, snapshot)
  const requiereAprobacion = input.descuentoManualPct > snapshot.topeDescuentoPct
  const vigenteHasta = addDaysStrAR(snapshot.validezDias)

  return await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT * FROM document_counters WHERE tipo = 'propuesta' FOR UPDATE`,
    )

    const [counter] = await tx
      .insert(documentCounters)
      .values({ tipo: 'propuesta', lastNumber: 0 })
      .onConflictDoUpdate({
        target: documentCounters.tipo,
        set: { lastNumber: documentCounters.lastNumber },
      })
      .returning()

    const numero = (counter?.lastNumber ?? 0) + 1

    await tx
      .update(documentCounters)
      .set({ lastNumber: numero })
      .where(eq(documentCounters.tipo, 'propuesta'))

    const [propuesta] = await tx
      .insert(propuestas)
      .values({
        numero,
        leadId,
        cantidad: input.cantidad,
        gramaje: input.gramaje,
        packaging: input.packaging,
        descuentoManualPct: input.descuentoManualPct.toFixed(2),
        snapshot,
        resultado: { escenarios },
        estado: requiereAprobacion ? 'pendiente_aprobacion' : 'borrador',
        vigenteHasta,
        creadoPor,
      })
      .returning()

    return propuesta!
  })
}

export async function listarPropuestas(leadId: string): Promise<PropuestaResumen[]> {
  const rows = await db
    .select()
    .from(propuestas)
    .where(and(eq(propuestas.leadId, leadId), isNull(propuestas.deletedAt)))
    .orderBy(desc(propuestas.numero))

  return rows.map((r) => {
    // El total sale del resultado congelado, nunca de la config actual
    const resultado = r.resultado as { escenarios?: EscenarioCotizacion[] }
    const elegido = resultado.escenarios?.find((e) => e.elegido)
    return {
      id: r.id,
      numero: r.numero,
      fecha: r.createdAt,
      cantidad: r.cantidad,
      gramaje: r.gramaje,
      estado: r.estado,
      vigenteHasta: r.vigenteHasta,
      total: elegido?.total ?? 0,
    }
  })
}
