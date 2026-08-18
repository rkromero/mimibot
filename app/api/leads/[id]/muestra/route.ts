import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { leads, clientes, marcas, productos, activityLog } from '@/db/schema'
import { and, eq, isNull, ilike } from 'drizzle-orm'
import { canAccessLead } from '@/lib/authz'
import { esRolVentas } from '@/lib/authz/roles'
import { assertPuedeCargarProductos } from '@/lib/authz/marcas'
import { toApiError, NotFoundError, ValidationError, AuthzError } from '@/lib/errors'
import { validateUuidParam } from '@/lib/api/validate-params'
import { obtenerOCrearClienteDesdeLead } from '@/lib/clientes/conversion'
import { crearPedidoConItems } from '@/lib/pedidos/service'

// Tags de origen habilitados para el envío de muestras (ver intake). Ambos
// reciben el mismo producto muestra de la marca CDA.
const TAGS_MUESTRA = new Set(['landing-cda', 'web-alipro'])

/**
 * POST /api/leads/[id]/muestra — carga un pedido de muestra CDA para el lead.
 *
 * Solo para leads con tag `landing-cda` o `web-alipro`. Busca o crea el cliente
 * a partir del lead (el lead sigue abierto en el pipeline) y crea un pedido con
 * el producto "Muestra" de la marca CDA (cantidad 1, precio del producto).
 */
export async function POST(
  _req: NextRequest,
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

    const lead = await db.query.leads.findFirst({
      where: and(eq(leads.id, id), isNull(leads.deletedAt)),
      with: {
        contact: true,
        tags: { with: { tag: true } },
      },
    })
    if (!lead) throw new NotFoundError('Lead')

    const habilitado = lead.tags.some((lt) => lt.tag?.name && TAGS_MUESTRA.has(lt.tag.name))
    if (!habilitado) {
      throw new ValidationError('El envío de muestras es solo para leads de CDA o ALIPRO (tags landing-cda / web-alipro)')
    }

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
    const { cliente, wasNew } = await db.transaction(async (tx) => {
      const porLead = await tx.query.clientes.findFirst({
        where: and(eq(clientes.leadId, lead.id), isNull(clientes.deletedAt)),
      })
      if (porLead) return { cliente: porLead, wasNew: false }
      return obtenerOCrearClienteDesdeLead(tx, lead, session.user.id)
    })

    const vendedorId = lead.assignedTo ?? session.user.id
    const crearComoPendienteAprobacion = esRolVentas(session.user.role)

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
        crearComoPendienteAprobacion,
      },
    )

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
      },
    })

    return NextResponse.json(
      { data: { pedidoId: pedido.id, clienteId: cliente.id, estado: pedido.estado, total: pedido.total } },
      { status: 201 },
    )
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
