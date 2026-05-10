import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { toApiError, AuthzError } from '@/lib/errors'
import { getSessionContext } from '@/lib/territorios/context'
import { canAccessCliente } from '@/lib/authz/clientes'
import { db } from '@/db'
import { historialTeritorioCliente, territorios, users } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

type RouteCtx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteCtx) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const ctx = await getSessionContext(session.user)
    const { id: clienteId } = await params

    await canAccessCliente(session.user, clienteId, ctx)

    const rows = await db
      .select({
        historial: historialTeritorioCliente,
        cambiadoPorNombre: users.name,
      })
      .from(historialTeritorioCliente)
      .leftJoin(users, eq(historialTeritorioCliente.cambiadoPor, users.id))
      .where(eq(historialTeritorioCliente.clienteId, clienteId))
      .orderBy(desc(historialTeritorioCliente.fecha))

    return NextResponse.json({ data: rows.map((r) => ({ ...r.historial, cambiadoPorNombre: r.cambiadoPorNombre ?? null })) })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
