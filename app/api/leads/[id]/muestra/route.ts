import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { leads, clientes, marcas, productos, activityLog } from '@/db/schema'
import { and, eq, isNull, ilike } from 'drizzle-orm'
import { canAccessLead } from '@/lib/authz'
import { assertPuedeCargarProductos } from '@/lib/authz/marcas'
import { toApiError, NotFoundError, ValidationError, AuthzError } from '@/lib/errors'
import { validateUuidParam } from '@/lib/api/validate-params'
import { obtenerOCrearClienteDesdeLead, completarClienteDesdeLead } from '@/lib/clientes/conversion'
import { crearPedidoConItems } from '@/lib/pedidos/service'
import { muestraLeadSchema } from '@/lib/validations/lead'
import { registrarPagoPedido } from '@/lib/cuenta-corriente/pago.service'

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

    const lead = await db.query.leads.findFirst({
      where: and(eq(leads.id, id), isNull(leads.deletedAt)),
      with: { contact: true },
    })
    if (!lead) throw new NotFoundError('Lead')

    // Producto "Muestra" de la marca CDA — se busca por marca + nombre para no
    // atar el código a un ID/SKU puntual (hoy: "Muestras", SKU CDA023).
    const marcaCda = await db.query.marcas.findFirst({ where: eq(marcas.slug, 'cda') })
    if (!marcaCda) throw new NotFoundError('Marca CDA')

    const productoMuestra = await db.query.productos.findFirst({
      where: and(
        eq(productos.marcaId, marcaCda.id),
        eq(productos.activo, true),
        isNull(productos.deletedAt),
        ilike(productos.nombre, 'muestra%'),
      ),
    })
    if (!productoMuestra) {
      throw new NotFoundError('Producto "Muestra" activo de la marca CDA (cargalo en Productos)')
    }

    await assertPuedeCargarProductos(session.user, [productoMuestra.id])

    // Cliente: reutilizar el ya vinculado al lead, o buscar/crear uno.
    // A diferencia de la conversión al ganar, el lead queda abierto.
    // Si se cargó un expreso nuevo, queda guardado en la ficha del cliente
    // (mismo comportamiento que el alta de pedidos de los agentes).
    const expresoNuevo =
      input.metodoEntrega === 'expreso' && input.expresoNombre && input.expresoDireccion
        ? { nombre: input.expresoNombre, direccion: input.expresoDireccion }
        : null

    const { cliente, wasNew } = await db.transaction(async (tx) => {
      const porLead = await tx.query.clientes.findFirst({
        where: and(eq(clientes.leadId, lead.id), isNull(clientes.deletedAt)),
      })
      // Cliente ya vinculado: le completamos la dirección y el CUIT/DNI que se
      // hayan cargado en el lead desde la muestra anterior (sin pisar nada).
      const base = porLead
        ? { cliente: await completarClienteDesdeLead(tx, porLead, lead), wasNew: false }
        : await obtenerOCrearClienteDesdeLead(tx, lead, session.user.id)

      if (!expresoNuevo) return base

      const [actualizado] = await tx
        .update(clientes)
        .set({
          expresoNombre: expresoNuevo.nombre,
          expresoDireccion: expresoNuevo.direccion,
          updatedAt: new Date(),
        })
        .where(eq(clientes.id, base.cliente.id))
        .returning()
      return { cliente: actualizado ?? base.cliente, wasNew: base.wasNew }
    })

    // Método de entrega resuelto: expreso nuevo, o el guardado en la ficha.
    let expresoNombre: string | null = null
    let expresoDireccion: string | null = null
    if (input.metodoEntrega === 'expreso') {
      if (expresoNuevo) {
        expresoNombre = expresoNuevo.nombre
        expresoDireccion = expresoNuevo.direccion
      } else if (cliente.expresoNombre) {
        expresoNombre = cliente.expresoNombre
        expresoDireccion = cliente.expresoDireccion ?? null
      } else {
        throw new ValidationError('Indicá el nombre y la dirección del expreso para despachar la muestra')
      }
    }

    const vendedorId = lead.assignedTo ?? session.user.id

    const pedido = await crearPedidoConItems(
      cliente.id,
      vendedorId,
      null,
      `Muestra CDA — generado desde el lead de ${lead.contact?.name ?? 'contacto'}`,
      [{ productoId: productoMuestra.id, cantidad: 1 }],
      db,
      {
        creadoPor: session.user.id,
        registradoPor: session.user.id,
        territorioIdImputado: cliente.territorioId ?? null,
        // Las muestras siempre pasan por aprobación, aunque las cargue un admin.
        crearComoPendienteAprobacion: true,
        metodoEntrega: input.metodoEntrega,
        expresoNombre,
        expresoDireccion,
        tipo: 'muestra',
        leadId: lead.id,
      },
    )

    // Pago simbólico por el total (precio de la muestra) para que la cuenta
    // corriente del cliente quede saldada. Si la muestra vale $0, no hay nada
    // que registrar.
    let pagoSimbolico: string | null = null
    if (parseFloat(pedido.total) > 0) {
      const pago = await registrarPagoPedido({
        pedidoId: pedido.id,
        monto: pedido.total,
        metodoPago: null,
        registradoPor: session.user.id,
        descripcion: 'Muestra CDA bonificada — pago simbólico automático',
      })
      pagoSimbolico = pago.movimiento.monto
    }

    await db.insert(activityLog).values({
      leadId: lead.id,
      userId: session.user.id,
      action: 'muestra_creada',
      metadata: {
        pedidoId: pedido.id,
        clienteId: cliente.id,
        clienteNuevo: wasNew,
        productoId: productoMuestra.id,
        producto: productoMuestra.nombre,
        metodoEntrega: input.metodoEntrega,
        expresoNombre,
        pagoSimbolico,
      },
    })

    return NextResponse.json(
      {
        data: {
          pedidoId: pedido.id,
          clienteId: cliente.id,
          estado: pedido.estado,
          total: pedido.total,
          metodoEntrega: input.metodoEntrega,
          expresoNombre,
          pagoSimbolico,
        },
      },
      { status: 201 },
    )
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
