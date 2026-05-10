import { eq, and, inArray, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { clientes } from '@/db/schema'
import { AuthzError } from '@/lib/errors'
import type { Session } from 'next-auth'
import type { SessionContext } from '@/lib/territorios/context'

type SessionUser = Session['user']

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
    const territoriosIds = ctx?.territoriosGestionados ?? []
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
