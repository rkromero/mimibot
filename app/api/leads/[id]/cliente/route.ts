import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { leads } from '@/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { canAccessLead } from '@/lib/authz'
import { esRolReparto } from '@/lib/authz/roles'
import { toApiError, NotFoundError, AuthzError } from '@/lib/errors'
import { validateUuidParam } from '@/lib/api/validate-params'
import { obtenerOCrearClienteParaLead } from '@/lib/clientes/conversion'

/**
 * POST /api/leads/[id]/cliente — asegura que el lead tenga su ficha de cliente
 * y la devuelve, para cargarle un pedido desde el chat ("+ Cargar pedido").
 *
 * Si ya hay un cliente vinculado lo devuelve (completándole dirección y CUIT
 * que tenga el lead); si no, lo busca por email/CUIT o lo crea con los datos
 * del lead. El lead NO cambia de etapa acá: pasa a "Ganado" recién cuando el
 * pedido queda registrado (lo hace el cliente vía PATCH /api/leads/[id]).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    if (session.user.role === 'fabrica' || esRolReparto(session.user.role)) {
      throw new AuthzError('Tu rol no puede cargar pedidos')
    }

    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid
    await canAccessLead(session.user, id)

    const lead = await db.query.leads.findFirst({
      where: and(eq(leads.id, id), isNull(leads.deletedAt)),
      with: { contact: true },
    })
    if (!lead) throw new NotFoundError('Lead')

    const { cliente, wasNew } = await db.transaction((tx) =>
      obtenerOCrearClienteParaLead(tx, lead, session.user.id),
    )

    return NextResponse.json({ data: { clienteId: cliente.id, wasNew } })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
