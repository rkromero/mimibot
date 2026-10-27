/**
 * Muestra CDA para un lead: busca o crea el cliente a partir del lead (el
 * lead sigue abierto en el pipeline) y crea un pedido con el producto
 * "Muestra" de la marca CDA (cantidad 1, precio del producto). Nace
 * confirmado: la muestra no pasa por aprobación, fábrica la ve en el acto.
 * Lo usan el botón de la ficha del lead (app/api/leads/[id]/muestra) y el
 * bot después de la propuesta (lib/claude/bot-post-propuesta.ts).
 *
 * El pedido queda marcado como `tipo = 'muestra'` con el `leadId` de origen.
 * El lead NO cambia de etapa acá: pasa a "Muestra enviada" recién cuando el
 * pedido se entrega (ver lib/leads/muestra-enviada.ts).
 *
 * La muestra tiene un precio simbólico (hoy $1). Para que el cliente no quede
 * con saldo deudor por una muestra bonificada, se registra en el mismo acto
 * un pago por el total del pedido, imputado a ese pedido: la CC queda en cero
 * y el pedido "pagado".
 */
import { and, desc, eq, ilike, isNull, ne } from 'drizzle-orm'
import { db } from '@/db'
import { activityLog, clientes, leads, marcas, pedidos, productos } from '@/db/schema'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { obtenerOCrearClienteParaLead } from '@/lib/clientes/conversion'
import { crearPedidoConItems } from '@/lib/pedidos/service'
import { registrarPagoPedido } from '@/lib/cuenta-corriente/pago.service'

export type MetodoEntregaMuestra = 'retiro_fabrica' | 'expreso'

export type CrearMuestraInput = {
  leadId: string
  metodoEntrega: MetodoEntregaMuestra
  expresoNombre?: string | null
  expresoDireccion?: string | null
  /** Usuario a cuyo nombre se carga (creadoPor / registradoPor / actividad) */
  userId: string
  /** Chequeo de permisos sobre el producto (la ruta lo hace con la sesión; el bot no lo necesita) */
  verificarPermisos?: (productoId: string) => Promise<void>
  /** Para la actividad: desde dónde se cargó */
  origen?: 'ficha' | 'bot'
}

export type MuestraCreada = {
  pedidoId: string
  clienteId: string
  clienteNuevo: boolean
  estado: string
  total: string
  metodoEntrega: MetodoEntregaMuestra
  expresoNombre: string | null
  expresoDireccion: string | null
  pagoSimbolico: string | null
}

export async function crearMuestraParaLead(input: CrearMuestraInput): Promise<MuestraCreada> {
  const lead = await db.query.leads.findFirst({
    where: and(eq(leads.id, input.leadId), isNull(leads.deletedAt)),
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

  if (input.verificarPermisos) await input.verificarPermisos(productoMuestra.id)

  // Cliente: reutilizar el ya vinculado al lead, o buscar/crear uno.
  // A diferencia de la conversión al ganar, el lead queda abierto.
  // Si se cargó un expreso nuevo, queda guardado en la ficha del cliente
  // (mismo comportamiento que el alta de pedidos de los agentes).
  const expresoNuevo =
    input.metodoEntrega === 'expreso' && input.expresoNombre && input.expresoDireccion
      ? { nombre: input.expresoNombre, direccion: input.expresoDireccion }
      : null

  const { cliente, wasNew } = await db.transaction(async (tx) => {
    // Cliente ya vinculado (le completa la dirección y el CUIT/DNI cargados
    // en el lead desde la muestra anterior, sin pisar nada) o buscar/crear.
    const base = await obtenerOCrearClienteParaLead(tx, lead, input.userId)

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

  const vendedorId = lead.assignedTo ?? input.userId

  const pedido = await crearPedidoConItems(
    cliente.id,
    vendedorId,
    null,
    `Muestra CDA — generado desde el lead de ${lead.contact?.name ?? 'contacto'}`,
    [{ productoId: productoMuestra.id, cantidad: 1 }],
    db,
    {
      creadoPor: input.userId,
      registradoPor: input.userId,
      territorioIdImputado: cliente.territorioId ?? null,
      // La muestra se autoaprueba: nace confirmada, sin importar quién la carga.
      crearComoPendienteAprobacion: false,
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
      registradoPor: input.userId,
      descripcion: 'Muestra CDA bonificada — pago simbólico automático',
    })
    pagoSimbolico = pago.movimiento.monto
  }

  await db.insert(activityLog).values({
    leadId: lead.id,
    userId: input.userId,
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
      ...(input.origen ? { origen: input.origen } : {}),
    },
  })

  return {
    pedidoId: pedido.id,
    clienteId: cliente.id,
    clienteNuevo: wasNew,
    estado: pedido.estado,
    total: pedido.total,
    metodoEntrega: input.metodoEntrega,
    expresoNombre,
    expresoDireccion,
    pagoSimbolico,
  }
}

export type MuestraExistente = {
  id: string
  estado: string
  metodoEntrega: string | null
  createdAt: Date
  entregadoAt: Date | null
}

/** Última muestra no cancelada del lead (para no cargar dos). */
export async function muestraDelLead(leadId: string): Promise<MuestraExistente | null> {
  const row = await db.query.pedidos.findFirst({
    where: and(
      eq(pedidos.leadId, leadId),
      eq(pedidos.tipo, 'muestra'),
      ne(pedidos.estado, 'cancelado'),
      isNull(pedidos.deletedAt),
    ),
    orderBy: [desc(pedidos.createdAt)],
    columns: { id: true, estado: true, metodoEntrega: true, createdAt: true, entregadoAt: true },
  })
  return row ?? null
}
