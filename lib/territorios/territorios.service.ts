import { eq, and, isNull, inArray, count } from 'drizzle-orm'
import { db } from '@/db'
import {
  territorios, territorioAgente, territorioGerente, clientes, users,
} from '@/db/schema'
import { AuthzError, NotFoundError, ValidationError } from '@/lib/errors'
import type { SessionContext } from './context'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TeritorioRow = typeof territorios.$inferSelect

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getAgenteActivo(territorioId: string) {
  return db.query.territorioAgente.findFirst({
    where: and(
      eq(territorioAgente.territorioId, territorioId),
      isNull(territorioAgente.fechaDesasignacion),
    ),
    columns: { id: true, agenteId: true, fechaAsignacion: true },
  })
}

// ─── Listar ───────────────────────────────────────────────────────────────────

export async function listarTerritorios(ctx: SessionContext) {
  let territorioIds: string[] | undefined

  if (ctx.role === 'gerente') {
    if (ctx.territoriosGestionados.length === 0) return []
    territorioIds = ctx.territoriosGestionados
  } else if (ctx.role === 'agent') {
    if (ctx.territoriosActivos.length === 0) return []
    territorioIds = ctx.territoriosActivos
  }

  const rows = await db.query.territorios.findMany({
    where: and(
      isNull(territorios.deletedAt),
      territorioIds ? inArray(territorios.id, territorioIds) : undefined,
    ),
    orderBy: territorios.nombre,
  })

  // Enrich with agente activo and gerentes
  return Promise.all(rows.map(async (t) => {
    const agenteRow = await getAgenteActivo(t.id)
    let agente: { id: string; name: string | null; avatarColor: string } | null = null
    if (agenteRow) {
      const u = await db.query.users.findFirst({
        where: eq(users.id, agenteRow.agenteId),
        columns: { id: true, name: true, avatarColor: true },
      })
      agente = u ?? null
    }

    const gerentesRows = await db.query.territorioGerente.findMany({
      where: eq(territorioGerente.territorioId, t.id),
      columns: { gerenteId: true },
    })
    const gerentes = await Promise.all(
      gerentesRows.map(async (g) => {
        const u = await db.query.users.findFirst({
          where: eq(users.id, g.gerenteId),
          columns: { id: true, name: true, avatarColor: true },
        })
        return u ?? null
      }),
    )

    const [cantClientes] = await db
      .select({ value: count() })
      .from(clientes)
      .where(and(eq(clientes.territorioId, t.id), isNull(clientes.deletedAt)))

    return {
      ...t,
      sinAgente: !agenteRow,
      agente,
      gerentes: gerentes.filter(Boolean),
      cantClientes: cantClientes?.value ?? 0,
    }
  }))
}

// ─── Obtener por ID ───────────────────────────────────────────────────────────

export async function getTerritorio(id: string, ctx: SessionContext) {
  const t = await db.query.territorios.findFirst({
    where: and(eq(territorios.id, id), isNull(territorios.deletedAt)),
  })
  if (!t) throw new NotFoundError('Territorio')

  if (ctx.role === 'gerente' && !ctx.territoriosGestionados.includes(id)) {
    throw new AuthzError('No tenés acceso a este territorio')
  }
  if (ctx.role === 'agent' && !ctx.territoriosActivos.includes(id)) {
    throw new AuthzError('No tenés acceso a este territorio')
  }

  return t
}

// ─── Crear ────────────────────────────────────────────────────────────────────

export async function crearTerritorio(
  input: { nombre: string; descripcion?: string | null },
  userId: string,
) {
  const existing = await db.query.territorios.findFirst({
    where: eq(territorios.nombre, input.nombre),
    columns: { id: true },
  })
  if (existing) throw new ValidationError(`Ya existe un territorio con el nombre "${input.nombre}"`)

  const [row] = await db
    .insert(territorios)
    .values({
      nombre: input.nombre,
      descripcion: input.descripcion ?? null,
      creadoPor: userId,
    })
    .returning()

  return row!
}

// ─── Editar ───────────────────────────────────────────────────────────────────

export async function editarTerritorio(
  id: string,
  input: { nombre?: string; descripcion?: string | null },
) {
  const t = await db.query.territorios.findFirst({
    where: and(eq(territorios.id, id), isNull(territorios.deletedAt)),
    columns: { id: true, esLegacy: true },
  })
  if (!t) throw new NotFoundError('Territorio')

  if (input.nombre) {
    const dup = await db.query.territorios.findFirst({
      where: and(eq(territorios.nombre, input.nombre), isNull(territorios.deletedAt)),
      columns: { id: true },
    })
    if (dup && dup.id !== id) {
      throw new ValidationError(`Ya existe un territorio con el nombre "${input.nombre}"`)
    }
  }

  const [updated] = await db
    .update(territorios)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(territorios.id, id))
    .returning()

  return updated!
}

// ─── Asignar agente ───────────────────────────────────────────────────────────

export async function asignarAgente(territorioId: string, agenteId: string) {
  const t = await db.query.territorios.findFirst({
    where: and(eq(territorios.id, territorioId), isNull(territorios.deletedAt)),
    columns: { id: true },
  })
  if (!t) throw new NotFoundError('Territorio')

  const agente = await db.query.users.findFirst({
    where: eq(users.id, agenteId),
    columns: { id: true, role: true },
  })
  if (!agente) throw new NotFoundError('Usuario')
  if (agente.role !== 'agent') {
    throw new ValidationError('Solo se puede asignar un agente (role=agent) a un territorio')
  }

  // Desasignar el agente activo anterior si existe
  await db
    .update(territorioAgente)
    .set({ fechaDesasignacion: new Date() })
    .where(
      and(
        eq(territorioAgente.territorioId, territorioId),
        isNull(territorioAgente.fechaDesasignacion),
      ),
    )

  const [row] = await db
    .insert(territorioAgente)
    .values({ territorioId, agenteId })
    .returning()

  return row!
}

// ─── Desasignar agente ────────────────────────────────────────────────────────

export async function desasignarAgente(territorioId: string) {
  await db
    .update(territorioAgente)
    .set({ fechaDesasignacion: new Date() })
    .where(
      and(
        eq(territorioAgente.territorioId, territorioId),
        isNull(territorioAgente.fechaDesasignacion),
      ),
    )
}

// ─── Asignar gerente ──────────────────────────────────────────────────────────

export async function asignarGerente(territorioId: string, gerenteId: string) {
  const t = await db.query.territorios.findFirst({
    where: and(eq(territorios.id, territorioId), isNull(territorios.deletedAt)),
    columns: { id: true },
  })
  if (!t) throw new NotFoundError('Territorio')

  const gerente = await db.query.users.findFirst({
    where: eq(users.id, gerenteId),
    columns: { id: true, role: true },
  })
  if (!gerente) throw new NotFoundError('Usuario')
  if (gerente.role !== 'gerente') {
    throw new ValidationError('Solo se puede asignar un gerente (role=gerente) a un territorio')
  }

  await db
    .insert(territorioGerente)
    .values({ territorioId, gerenteId })
    .onConflictDoNothing()

  return { territorioId, gerenteId }
}

// ─── Quitar gerente ───────────────────────────────────────────────────────────

export async function quitarGerente(territorioId: string, gerenteId: string) {
  await db
    .delete(territorioGerente)
    .where(
      and(
        eq(territorioGerente.territorioId, territorioId),
        eq(territorioGerente.gerenteId, gerenteId),
      ),
    )
}

// ─── Dar de baja ──────────────────────────────────────────────────────────────

export async function darDeBajaTerritorio(id: string) {
  const t = await db.query.territorios.findFirst({
    where: and(eq(territorios.id, id), isNull(territorios.deletedAt)),
    columns: { id: true, esLegacy: true },
  })
  if (!t) throw new NotFoundError('Territorio')

  if (t.esLegacy) {
    throw new ValidationError('El territorio "Sin asignar" no puede ser eliminado')
  }

  const [cantRow] = await db
    .select({ value: count() })
    .from(clientes)
    .where(and(eq(clientes.territorioId, id), isNull(clientes.deletedAt)))

  if ((cantRow?.value ?? 0) > 0) {
    throw new ValidationError(
      `No se puede dar de baja: hay ${cantRow!.value} cliente(s) asignado(s) a este territorio. Reasignalos primero.`,
    )
  }

  await db
    .update(territorios)
    .set({ activo: false, deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(territorios.id, id))
}

// ─── Obtener agente activo de un territorio ───────────────────────────────────

export { getAgenteActivo }
