import { eq, and, inArray, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { clientes } from '@/db/schema'
import { AuthzError } from '@/lib/errors'
import type { Session } from 'next-auth'
import { getSessionContext, type SessionContext } from '@/lib/territorios/context'

type SessionUser = Session['user']

/**
 * Verifica que el usuario logueado pueda acceder a un cliente.
 *
 * - admin: siempre puede
 * - agent: solo si el cliente está asignado a él (clientes.asignadoA === userId)
 * - gerente: solo si el cliente pertenece a un territorio que el gerente
 *   gestiona (clientes.territorioId IN ctx.territoriosGestionados)
 *
 * `ctx` es opcional: si no se pasa, se carga internamente con
 * getSessionContext. La mayoría de los callers no lo pasan, así que es
 * importante que el helper sea autosuficiente — antes asumía territorios
 * vacíos cuando faltaba ctx y siempre tiraba 403 para gerente.
 */
export async function canAccessCliente(
  user: SessionUser,
  clienteId: string,
  ctx?: SessionContext,
): Promise<void> {
  if (user.role === 'admin') return

  if (user.role === 'agent') {
    const cliente = await db.query.clientes.findFirst({
      where: and(
        eq(clientes.id, clienteId),
        eq(clientes.asignadoA, user.id),
      ),
      columns: { id: true },
    })
    if (!cliente) throw new AuthzError('No tenés acceso a este cliente')
    return
  }

  if (user.role === 'gerente') {
    // Si no nos pasaron el ctx, lo cargamos aca para no tener que asumir
    // que el caller se acordo. Asi un olvido del caller no se traduce en
    // un 403 enganoso ("no tenes territorios") cuando en realidad si los tiene.
    const effectiveCtx = ctx ?? await getSessionContext(user)
    const territoriosIds = effectiveCtx.territoriosGestionados

    if (territoriosIds.length === 0) throw new AuthzError('No tenés territorios asignados')

    const cliente = await db.query.clientes.findFirst({
      where: and(
        eq(clientes.id, clienteId),
        inArray(clientes.territorioId, territoriosIds),
        isNull(clientes.deletedAt),
      ),
      columns: { id: true },
    })
    if (!cliente) throw new AuthzError('No tenés acceso a este cliente')
    return
  }

  throw new AuthzError('Rol desconocido')
}
