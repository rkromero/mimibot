import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { toApiError, AuthzError } from '@/lib/errors'
import { getSessionContext } from '@/lib/territorios/context'
import { getTerritorio } from '@/lib/territorios/territorios.service'
import { db } from '@/db'
import { historialTeritorioCliente, clientes, territorios, users } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

type RouteCtx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteCtx) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    if (session.user.role === 'agent') {
      throw new AuthzError('No autorizado')
    }

    const ctx = await getSessionContext(session.user)
    const { id } = await params

    // Validates access for gerente
    await getTerritorio(id, ctx)

    const rows = await db
      .select({
        historial: historialTeritorioCliente,
        clienteNombre: clientes.nombre,
        clienteApellido: clientes.apellido,
        territorioAnteriorNombre: territorios.nombre,
        cambiadoPorNombre: users.name,
      })
      .from(historialTeritorioCliente)
      .leftJoin(clientes, eq(historialTeritorioCliente.clienteId, clientes.id))
      .leftJoin(territorios, eq(historialTeritorioCliente.territorioAnteriorId, territorios.id))
      .leftJoin(users, eq(historialTeritorioCliente.cambiadoPor, users.id))
      .where(eq(historialTeritorioCliente.territorioNuevoId, id))
      .orderBy(desc(historialTeritorioCliente.fecha))
      .limit(100)

    const data = rows.map((r) => ({
      ...r.historial,
      clienteNombre: r.clienteNombre ? `${r.clienteNombre} ${r.clienteApellido}` : null,
      territorioAnteriorNombre: r.territorioAnteriorNombre ?? null,
      cambiadoPorNombre: r.cambiadoPorNombre ?? null,
    }))

    return NextResponse.json({ data })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
