import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { clientes } from '@/db/schema'
import { AuthzError } from '@/lib/errors'
import type { Session } from 'next-auth'

type SessionUser = Session['user']

export async function canAccessCliente(
  user: SessionUser,
  clienteId: string,
): Promise<void> {
  if (user.role === 'admin') return

  const cliente = await db.query.clientes.findFirst({
    where: and(
      eq(clientes.id, clienteId),
      eq(clientes.asignadoA, user.id),
    ),
    columns: { id: true },
  })

  if (!cliente) throw new AuthzError('No tenés acceso a este cliente')
}
