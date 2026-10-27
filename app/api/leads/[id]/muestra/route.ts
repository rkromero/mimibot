import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { clientes } from '@/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { canAccessLead } from '@/lib/authz'
import { assertPuedeCargarProductos } from '@/lib/authz/marcas'
import { toApiError, AuthzError } from '@/lib/errors'
import { validateUuidParam } from '@/lib/api/validate-params'
import { crearMuestraParaLead } from '@/lib/leads/muestra.service'
import { muestraLeadSchema } from '@/lib/validations/lead'

/**
 * GET /api/leads/[id]/muestra — datos para el modal de muestra: el cliente ya
 * vinculado al lead (si existe) con su expreso guardado, para ofrecer
 * "¿despachar por el mismo?" igual que en el alta de pedidos de los agentes.
 */
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
    await canAccessLead(session.user, id)

    const cliente = await db.query.clientes.findFirst({
      where: and(eq(clientes.leadId, id), isNull(clientes.deletedAt)),
      columns: { id: true, expresoNombre: true, expresoDireccion: true },
    })

    return NextResponse.json({ data: { cliente: cliente ?? null } })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

/**
 * POST /api/leads/[id]/muestra — carga un pedido de muestra CDA para el lead.
 *
 * Disponible para cualquier lead, sin importar el tag de origen. Busca o crea
 * el cliente a partir del lead (el lead sigue abierto en el pipeline) y crea un
 * pedido con el producto "Muestra" de la marca CDA (cantidad 1, precio del
 * producto).
 *
 * Body: `{ metodoEntrega: 'retiro_fabrica' | 'expreso', expresoNombre?, expresoDireccion? }`
 * — el mismo paso "Entrega" que cargan los agentes, así fábrica sabe qué
 * muestras se retiran y cuáles hay que despachar (y por qué expreso).
 *
 * El pedido nace SIEMPRE en `pendiente_aprobacion`, sin importar el rol de
 * quien lo carga (admin incluido): la muestra la aprueba después quien
 * corresponda, como cualquier pedido de agente.
 *
 * El pedido queda marcado como `tipo = 'muestra'` con el `leadId` de origen.
 * El lead NO cambia de etapa acá: pasa a "Muestra enviada" recién cuando el
 * pedido se entrega (ver lib/leads/muestra-enviada.ts).
 *
 * La muestra tiene un precio simbólico (hoy $1). Para que el cliente no quede
 * con saldo deudor por una muestra bonificada, se registra en el mismo acto
 * un pago por el total del pedido, imputado a ese pedido: la CC queda en cero
 * y el pedido "pagado". Esto aplica SOLO a las muestras cargadas con este botón.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    if (session.user.role === 'fabrica') {
      throw new AuthzError('El rol fábrica no puede crear pedidos')
    }

    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid
    await canAccessLead(session.user, id)

    const body: unknown = await req.json().catch(() => ({}))
    const parsed = muestraLeadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }
    const input = parsed.data

    // La lógica (cliente, pedido de muestra, pago simbólico, actividad) vive
    // en lib/leads/muestra.service.ts, compartida con el bot post-propuesta.
    const muestra = await crearMuestraParaLead({
      leadId: id,
      metodoEntrega: input.metodoEntrega,
      expresoNombre: input.expresoNombre ?? null,
      expresoDireccion: input.expresoDireccion ?? null,
      userId: session.user.id,
      verificarPermisos: (productoId) => assertPuedeCargarProductos(session.user, [productoId]),
      origen: 'ficha',
    })

    return NextResponse.json(
      {
        data: {
          pedidoId: muestra.pedidoId,
          clienteId: muestra.clienteId,
          estado: muestra.estado,
          total: muestra.total,
          metodoEntrega: muestra.metodoEntrega,
          expresoNombre: muestra.expresoNombre,
          pagoSimbolico: muestra.pagoSimbolico,
        },
      },
      { status: 201 },
    )
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
