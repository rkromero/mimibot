import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { metas, auditLogMetas, users } from '@/db/schema'
import { NotFoundError, ValidationError } from '@/lib/errors'
import type { UpdateMetaInput } from '@/lib/validations/metas'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Meta = typeof metas.$inferSelect
export type MetaWithVendedor = Meta & { vendedorNombre: string | null }

export type PeriodoStatus = 'bloqueado_pasado' | 'vigente' | 'futuro'

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isMesBloqueable(anio: number, mes: number): PeriodoStatus {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  if (anio < currentYear || (anio === currentYear && mes < currentMonth)) {
    return 'bloqueado_pasado'
  }
  if (anio === currentYear && mes === currentMonth) return 'vigente'
  return 'futuro'
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function getMetaByVendedorPeriodo(
  vendedorId: string,
  anio: number,
  mes: number,
): Promise<Meta | null> {
  const row = await db.query.metas.findFirst({
    where: and(
      eq(metas.vendedorId, vendedorId),
      eq(metas.periodoAnio, anio),
      eq(metas.periodoMes, mes),
    ),
  })
  return row ?? null
}

export async function createMeta(
  input: {
    vendedorId: string
    periodoAnio: number
    periodoMes: number
    clientesNuevosObjetivo: number
    pedidosObjetivo: number
    montoCobradoObjetivo: string
    conversionLeadsObjetivo: string
  },
  adminId: string,
): Promise<Meta> {
  return db.transaction(async (tx) => {
    const [meta] = await tx
      .insert(metas)
      .values({
        vendedorId: input.vendedorId,
        periodoAnio: input.periodoAnio,
        periodoMes: input.periodoMes,
        clientesNuevosObjetivo: input.clientesNuevosObjetivo,
        pedidosObjetivo: input.pedidosObjetivo,
        montoCobradoObjetivo: input.montoCobradoObjetivo,
        conversionLeadsObjetivo: input.conversionLeadsObjetivo,
        creadoPor: adminId,
      })
      .returning()

    await tx.insert(auditLogMetas).values({
      metaId: meta!.id,
      accion: 'creacion',
      motivo: null,
      cambiadoPor: adminId,
      oldValues: null,
      newValues: {
        clientesNuevosObjetivo: input.clientesNuevosObjetivo,
        pedidosObjetivo: input.pedidosObjetivo,
        montoCobradoObjetivo: input.montoCobradoObjetivo,
        conversionLeadsObjetivo: input.conversionLeadsObjetivo,
      },
    })

    return meta!
  })
}

export async function updateMetaVigente(
  metaId: string,
  input: UpdateMetaInput,
  motivo: string,
  adminId: string,
): Promise<Meta> {
  return db.transaction(async (tx) => {
    const existing = await tx.query.metas.findFirst({
      where: eq(metas.id, metaId),
    })

    if (!existing) throw new NotFoundError('Meta')

    const status = isMesBloqueable(existing.periodoAnio, existing.periodoMes)
    if (status === 'bloqueado_pasado') {
      throw new ValidationError('Las metas de períodos pasados no se pueden modificar')
    }
    if (status === 'futuro') {
      throw new ValidationError('La meta futura se edita con PUT /api/metas/[id]')
    }

    const oldValues = {
      clientesNuevosObjetivo: existing.clientesNuevosObjetivo,
      pedidosObjetivo: existing.pedidosObjetivo,
      montoCobradoObjetivo: existing.montoCobradoObjetivo,
      conversionLeadsObjetivo: existing.conversionLeadsObjetivo,
    }

    const updatePayload: Partial<typeof metas.$inferInsert> = {
      fechaActualizacion: new Date(),
    }
    if (input.clientesNuevosObjetivo !== undefined) {
      updatePayload.clientesNuevosObjetivo = input.clientesNuevosObjetivo
    }
    if (input.pedidosObjetivo !== undefined) {
      updatePayload.pedidosObjetivo = input.pedidosObjetivo
    }
    if (input.montoCobradoObjetivo !== undefined) {
      updatePayload.montoCobradoObjetivo = input.montoCobradoObjetivo
    }
    if (input.conversionLeadsObjetivo !== undefined) {
      updatePayload.conversionLeadsObjetivo = input.conversionLeadsObjetivo
    }

    const [updated] = await tx
      .update(metas)
      .set(updatePayload)
      .where(eq(metas.id, metaId))
      .returning()

    const newValues = {
      clientesNuevosObjetivo: updated!.clientesNuevosObjetivo,
      pedidosObjetivo: updated!.pedidosObjetivo,
      montoCobradoObjetivo: updated!.montoCobradoObjetivo,
      conversionLeadsObjetivo: updated!.conversionLeadsObjetivo,
    }

    await tx.insert(auditLogMetas).values({
      metaId,
      accion: 'correccion_vigente',
      motivo,
      cambiadoPor: adminId,
      oldValues,
      newValues,
    })

    return updated!
  })
}

export async function updateMetaFutura(
  metaId: string,
  input: UpdateMetaInput,
  adminId: string,
): Promise<Meta> {
  const existing = await db.query.metas.findFirst({
    where: eq(metas.id, metaId),
  })

  if (!existing) throw new NotFoundError('Meta')

  const updatePayload: Partial<typeof metas.$inferInsert> = {
    fechaActualizacion: new Date(),
  }
  if (input.clientesNuevosObjetivo !== undefined) {
    updatePayload.clientesNuevosObjetivo = input.clientesNuevosObjetivo
  }
  if (input.pedidosObjetivo !== undefined) {
    updatePayload.pedidosObjetivo = input.pedidosObjetivo
  }
  if (input.montoCobradoObjetivo !== undefined) {
    updatePayload.montoCobradoObjetivo = input.montoCobradoObjetivo
  }
  if (input.conversionLeadsObjetivo !== undefined) {
    updatePayload.conversionLeadsObjetivo = input.conversionLeadsObjetivo
  }

  const [updated] = await db
    .update(metas)
    .set(updatePayload)
    .where(eq(metas.id, metaId))
    .returning()

  // Store audit log for future meta updates too
  await db.insert(auditLogMetas).values({
    metaId,
    accion: 'correccion_vigente',
    motivo: `Actualización de meta futura por admin ${adminId}`,
    cambiadoPor: adminId,
    oldValues: {
      clientesNuevosObjetivo: existing.clientesNuevosObjetivo,
      pedidosObjetivo: existing.pedidosObjetivo,
      montoCobradoObjetivo: existing.montoCobradoObjetivo,
      conversionLeadsObjetivo: existing.conversionLeadsObjetivo,
    },
    newValues: {
      clientesNuevosObjetivo: updated!.clientesNuevosObjetivo,
      pedidosObjetivo: updated!.pedidosObjetivo,
      montoCobradoObjetivo: updated!.montoCobradoObjetivo,
      conversionLeadsObjetivo: updated!.conversionLeadsObjetivo,
    },
  })

  return updated!
}

export async function duplicarMetasMesAnterior(
  anioObjetivo: number,
  mesObjetivo: number,
  adminId: string,
): Promise<{ created: number }> {
  // Calculate source period (previous month)
  let anioFuente = anioObjetivo
  let mesFuente = mesObjetivo - 1

  if (mesFuente === 0) {
    mesFuente = 12
    anioFuente = anioObjetivo - 1
  }

  return db.transaction(async (tx) => {
    // Load all metas from the source period
    const metasFuente = await tx.query.metas.findMany({
      where: and(
        eq(metas.periodoAnio, anioFuente),
        eq(metas.periodoMes, mesFuente),
      ),
    })

    if (metasFuente.length === 0) {
      return { created: 0 }
    }

    // Find vendedores that already have a meta for the target period
    const metasExistentes = await tx.query.metas.findMany({
      where: and(
        eq(metas.periodoAnio, anioObjetivo),
        eq(metas.periodoMes, mesObjetivo),
      ),
      columns: { vendedorId: true },
    })

    const vendedoresConMeta = new Set(metasExistentes.map((m) => m.vendedorId))

    // Filter out vendedores that already have a meta for target period
    const metasADuplicar = metasFuente.filter(
      (m) => !vendedoresConMeta.has(m.vendedorId),
    )

    if (metasADuplicar.length === 0) {
      return { created: 0 }
    }

    // Insert new metas for the target period
    const nuevasMetas = await tx
      .insert(metas)
      .values(
        metasADuplicar.map((m) => ({
          vendedorId: m.vendedorId,
          periodoAnio: anioObjetivo,
          periodoMes: mesObjetivo,
          clientesNuevosObjetivo: m.clientesNuevosObjetivo,
          pedidosObjetivo: m.pedidosObjetivo,
          montoCobradoObjetivo: m.montoCobradoObjetivo,
          conversionLeadsObjetivo: m.conversionLeadsObjetivo,
          creadoPor: adminId,
        })),
      )
      .returning()

    // Create audit log entries for each new meta
    if (nuevasMetas.length > 0) {
      await tx.insert(auditLogMetas).values(
        nuevasMetas.map((meta) => ({
          metaId: meta.id,
          accion: 'creacion',
          motivo: `Duplicada desde ${anioFuente}/${mesFuente}`,
          cambiadoPor: adminId,
          oldValues: null,
          newValues: {
            clientesNuevosObjetivo: meta.clientesNuevosObjetivo,
            pedidosObjetivo: meta.pedidosObjetivo,
            montoCobradoObjetivo: meta.montoCobradoObjetivo,
            conversionLeadsObjetivo: meta.conversionLeadsObjetivo,
          },
        })),
      )
    }

    return { created: nuevasMetas.length }
  })
}

// ─── Query helpers ────────────────────────────────────────────────────────────

export async function getMetaWithVendedor(metaId: string): Promise<MetaWithVendedor | null> {
  const rows = await db
    .select({
      meta: metas,
      vendedorNombre: users.name,
    })
    .from(metas)
    .leftJoin(users, eq(metas.vendedorId, users.id))
    .where(eq(metas.id, metaId))
    .limit(1)

  if (rows.length === 0) return null

  const row = rows[0]!
  return {
    ...row.meta,
    vendedorNombre: row.vendedorNombre ?? null,
  }
}
