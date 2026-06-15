import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pedidos, clientes } from '@/db/schema'
import { eq, and, isNull, inArray } from 'drizzle-orm'
import { getSignedUrl } from '@/lib/r2/signed-url'
import { toApiError, AuthzError, NotFoundError } from '@/lib/errors'
import { getSessionContext } from '@/lib/territorios/context'
import { validateUuidParam } from '@/lib/api/validate-params'
import { esRolVentas } from '@/lib/authz/roles'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid

    const ctx = await getSessionContext(session.user)

    const pedido = await db.query.pedidos.findFirst({
      where: and(eq(pedidos.id, id), isNull(pedidos.deletedAt)),
      columns: {
        id: true,
        clienteId: true,
        vendedorId: true,
        estado: true,
        metodoEntrega: true,
        esReparto: true,
        firmaUrl: true,
        remitoFotoUrl: true,
      },
    })
    if (!pedido) throw new NotFoundError('Pedido')

    // ── Validar acceso ──────────────────────────────────────────────────────────
    if (ctx.role === 'admin' || ctx.role === 'fabrica') {
      // acceso total
    } else if (esRolVentas(ctx.role)) {
      const cliente = await db.query.clientes.findFirst({
        where: and(eq(clientes.id, pedido.clienteId), eq(clientes.asignadoA, ctx.userId)),
        columns: { id: true },
      })
      if (!cliente) throw new AuthzError('No tenés acceso a este pedido')
    } else if (ctx.role === 'gerente') {
      if (ctx.territoriosGestionados.length === 0) throw new AuthzError('No tenés acceso a este pedido')
      const cliente = await db.query.clientes.findFirst({
        where: and(
          eq(clientes.id, pedido.clienteId),
          inArray(clientes.territorioId, ctx.territoriosGestionados),
        ),
        columns: { id: true },
      })
      if (!cliente) throw new AuthzError('No tenés acceso a este pedido')
    } else {
      throw new AuthzError('No tenés acceso a este pedido')
    }

    // ── Determinar qué comprobante corresponde ──────────────────────────────────
    const esExpreso = pedido.metodoEntrega === 'expreso'
    const esCamioneta = pedido.esReparto === true

    let key: string | null = null
    let tipo: 'remito' | 'firma' | null = null

    if (esExpreso) {
      key = pedido.remitoFotoUrl ?? null
      tipo = 'remito'
    } else if (esCamioneta) {
      key = pedido.firmaUrl ?? null
      tipo = 'firma'
    }

    if (!key) {
      return NextResponse.json({ url: null, tipo, missingComprobante: true })
    }

    const sanitized = key.replace(/\.\./g, '').replace(/^\/+/, '')
    const url = await getSignedUrl(sanitized)

    return NextResponse.json({ url, tipo, missingComprobante: false })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
