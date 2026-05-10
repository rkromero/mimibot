import { eq, and, isNull, inArray } from 'drizzle-orm'
import { db } from '@/db'
import {
  clientes, territorios, territorioAgente, historialTeritorioCliente,
} from '@/db/schema'
import { AuthzError, NotFoundError, ValidationError } from '@/lib/errors'
import type { SessionContext } from './context'
import { getAgenteActivo } from './territorios.service'

// ─── Resolver territorio al crear un cliente ──────────────────────────────────
// Devuelve { territorioId, agenteId } según las reglas de negocio por rol.
// territorioId null = pendiente de asignación.

export async function resolverTerritorioPorRol(
  ctx: SessionContext,
  territorioIdSolicitado?: string | null,
): Promise<{ territorioId: string | null; agenteId: string | null }> {

  if (ctx.role === 'agent') {
    let territorioId: string | null = null

    if (territorioIdSolicitado) {
      // Validate the agent actually belongs to this territory
      if (!ctx.territoriosActivos.includes(territorioIdSolicitado)) {
        throw new AuthzError('No sos agente activo de ese territorio')
      }
      territorioId = territorioIdSolicitado
    } else if (ctx.territoriosActivos.length === 1) {
      territorioId = ctx.territoriosActivos[0]!
    } else if (ctx.territoriosActivos.length > 1) {
      throw new ValidationError(
        'Tenés asignados varios territorios. Indicá el territorio_id al crear el cliente.',
      )
    }

    return { territorioId, agenteId: ctx.userId }
  }

  if (ctx.role === 'gerente') {
    if (!territorioIdSolicitado) {
      return { territorioId: null, agenteId: null }
    }
    if (!ctx.territoriosGestionados.includes(territorioIdSolicitado)) {
      throw new AuthzError('Ese territorio no está bajo tu gestión')
    }
    const agenteRow = await getAgenteActivo(territorioIdSolicitado)
    return {
      territorioId: territorioIdSolicitado,
      agenteId: agenteRow?.agenteId ?? null,
    }
  }

  // admin
  if (territorioIdSolicitado) {
    const t = await db.query.territorios.findFirst({
      where: and(eq(territorios.id, territorioIdSolicitado), isNull(territorios.deletedAt)),
      columns: { id: true },
    })
    if (!t) throw new NotFoundError('Territorio')
    const agenteRow = await getAgenteActivo(territorioIdSolicitado)
    return {
      territorioId: territorioIdSolicitado,
      agenteId: agenteRow?.agenteId ?? null,
    }
  }

  return { territorioId: null, agenteId: null }
}

// ─── Mover cliente a otro territorio (solo admin) ─────────────────────────────

export async function moverClienteATerritorio(
  clienteId: string,
  nuevoTerritorioId: string,
  userId: string,
) {
  const cliente = await db.query.clientes.findFirst({
    where: and(eq(clientes.id, clienteId), isNull(clientes.deletedAt)),
    columns: { id: true, territorioId: true },
  })
  if (!cliente) throw new NotFoundError('Cliente')

  const nuevoTerritorio = await db.query.territorios.findFirst({
    where: and(eq(territorios.id, nuevoTerritorioId), isNull(territorios.deletedAt)),
    columns: { id: true },
  })
  if (!nuevoTerritorio) throw new NotFoundError('Territorio destino')

  const agenteRow = await getAgenteActivo(nuevoTerritorioId)

  await db.transaction(async (tx) => {
    // Update client
    await tx
      .update(clientes)
      .set({
        territorioId: nuevoTerritorioId,
        asignadoA: agenteRow?.agenteId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(clientes.id, clienteId))

    // Log history
    await tx.insert(historialTeritorioCliente).values({
      clienteId,
      territorioAnteriorId: cliente.territorioId ?? null,
      territorioNuevoId: nuevoTerritorioId,
      cambiadoPor: userId,
    })
  })

  return { clienteId, nuevoTerritorioId, nuevoAgenteId: agenteRow?.agenteId ?? null }
}

// ─── Reasignación masiva de clientes (solo admin) ─────────────────────────────

export async function reasignacionMasiva(
  clienteIds: string[],
  nuevoTerritorioId: string,
  userId: string,
): Promise<{ movidos: number; errores: string[] }> {
  const territorio = await db.query.territorios.findFirst({
    where: and(eq(territorios.id, nuevoTerritorioId), isNull(territorios.deletedAt)),
    columns: { id: true },
  })
  if (!territorio) throw new NotFoundError('Territorio destino')

  const agenteRow = await getAgenteActivo(nuevoTerritorioId)

  const clientesExistentes = await db.query.clientes.findMany({
    where: and(inArray(clientes.id, clienteIds), isNull(clientes.deletedAt)),
    columns: { id: true, territorioId: true },
  })

  const idsEncontrados = new Set(clientesExistentes.map((c) => c.id))
  const errores = clienteIds
    .filter((id) => !idsEncontrados.has(id))
    .map((id) => `Cliente ${id} no encontrado`)

  if (clientesExistentes.length === 0) return { movidos: 0, errores }

  await db.transaction(async (tx) => {
    await tx
      .update(clientes)
      .set({
        territorioId: nuevoTerritorioId,
        asignadoA: agenteRow?.agenteId ?? null,
        updatedAt: new Date(),
      })
      .where(inArray(clientes.id, clientesExistentes.map((c) => c.id)))

    await tx.insert(historialTeritorioCliente).values(
      clientesExistentes.map((c) => ({
        clienteId: c.id,
        territorioAnteriorId: c.territorioId ?? null,
        territorioNuevoId: nuevoTerritorioId,
        cambiadoPor: userId,
      })),
    )
  })

  return { movidos: clientesExistentes.length, errores }
}

// ─── Sincronizar agente cuando cambia el agente activo de un territorio ───────
// Llamar cuando se asigna un nuevo agente a un territorio.

export async function sincronizarAgenteEnTerritorioClientes(
  territorioId: string,
  nuevoAgenteId: string | null,
) {
  await db
    .update(clientes)
    .set({ asignadoA: nuevoAgenteId, updatedAt: new Date() })
    .where(and(eq(clientes.territorioId, territorioId), isNull(clientes.deletedAt)))
}

// ─── Visibilidad: obtener IDs de clientes accesibles según contexto ───────────

export async function getClienteIdsVisibles(ctx: SessionContext): Promise<string[] | 'all'> {
  if (ctx.role === 'admin') return 'all'

  if (ctx.role === 'agent') {
    const rows = await db.query.clientes.findMany({
      where: and(
        eq(clientes.asignadoA, ctx.userId),
        isNull(clientes.deletedAt),
      ),
      columns: { id: true },
    })
    return rows.map((r) => r.id)
  }

  if (ctx.role === 'gerente') {
    if (ctx.territoriosGestionados.length === 0) return []
    const rows = await db.query.clientes.findMany({
      where: and(
        inArray(clientes.territorioId, ctx.territoriosGestionados),
        isNull(clientes.deletedAt),
      ),
      columns: { id: true },
    })
    return rows.map((r) => r.id)
  }

  return []
}
