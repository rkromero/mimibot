import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { clientes, pedidos, productos, leads, movimientosCC, businessConfig, stockMovements, users } from '@/db/schema'
import { and, eq, isNull, gt, asc, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { toApiError } from '@/lib/errors'
import { todayStrAR } from '@/lib/dates'
import { marcaVisibleFilter } from '@/lib/authz/marcas'

const BATCH_SIZE = 1000
const EMPTY_UUID = '00000000-0000-0000-0000-000000000000'

function escapeCsv(value: string | number | null | undefined | boolean): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function toCsvRow(fields: (string | number | null | undefined | boolean)[]): string {
  return fields.map(escapeCsv).join(',')
}

function formatMoney(value: string | null | undefined): string {
  if (!value) return '0.00'
  return parseFloat(value).toFixed(2)
}

// ── Keyset helpers ────────────────────────────────────────────────────────────

async function* streamClientes() {
  let lastId = EMPTY_UUID
  while (true) {
    const batch = await db
      .select({
        id: clientes.id,
        nombre: clientes.nombre,
        apellido: clientes.apellido,
        email: clientes.email,
        telefono: clientes.telefono,
        cuit: clientes.cuit,
        direccion: clientes.direccion,
        estadoActividad: clientes.estadoActividad,
        origen: clientes.origen,
        createdAt: clientes.createdAt,
      })
      .from(clientes)
      .where(and(isNull(clientes.deletedAt), gt(clientes.id, lastId)))
      .orderBy(asc(clientes.id))
      .limit(BATCH_SIZE)

    for (const r of batch) {
      yield toCsvRow([r.id, r.nombre, r.apellido, r.email, r.telefono, r.cuit, r.direccion, r.estadoActividad, r.origen, r.createdAt?.toISOString().split('T')[0]])
    }
    if (batch.length < BATCH_SIZE) break
    lastId = batch[batch.length - 1]!.id
  }
}

async function* streamPedidos() {
  const vendedorT = alias(users, 'vendedor_export')
  let lastId = EMPTY_UUID
  while (true) {
    const batch = await db
      .select({
        id: pedidos.id,
        fecha: pedidos.fecha,
        total: pedidos.total,
        montoPagado: pedidos.montoPagado,
        saldoPendiente: pedidos.saldoPendiente,
        estado: pedidos.estado,
        estadoPago: pedidos.estadoPago,
        clienteNombre: clientes.nombre,
        clienteApellido: clientes.apellido,
        clienteCuit: clientes.cuit,
        vendedorName: vendedorT.name,
      })
      .from(pedidos)
      .leftJoin(clientes, eq(pedidos.clienteId, clientes.id))
      .leftJoin(vendedorT, eq(pedidos.vendedorId, vendedorT.id))
      .where(and(isNull(pedidos.deletedAt), gt(pedidos.id, lastId)))
      .orderBy(asc(pedidos.id))
      .limit(BATCH_SIZE)

    for (const r of batch) {
      yield toCsvRow([
        r.id,
        r.fecha?.toISOString().split('T')[0],
        `${r.clienteNombre ?? ''} ${r.clienteApellido ?? ''}`.trim(),
        r.clienteCuit,
        r.vendedorName,
        r.estado,
        formatMoney(r.total),
        formatMoney(r.montoPagado),
        formatMoney(r.saldoPendiente),
        r.estadoPago,
      ])
    }
    if (batch.length < BATCH_SIZE) break
    lastId = batch[batch.length - 1]!.id
  }
}

function generatorToStream(
  generator: AsyncGenerator<string>,
  headers: string,
): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  const BOM = '﻿'
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(enc.encode(BOM + headers))
      for await (const row of generator) {
        controller.enqueue(enc.encode(row + '\n'))
      }
      controller.close()
    },
  })
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ entidad: string }> },
) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { entidad } = await params
    const today = todayStrAR()

    // ── Streaming exports (keyset pagination, no full table load) ─────────────

    if (entidad === 'clientes') {
      const csvHeaders = 'ID,Nombre,Apellido,Email,Telefono,CUIT,Direccion,Estado,Origen,Fecha Alta\n'
      const stream = generatorToStream(streamClientes(), csvHeaders)
      return new NextResponse(stream, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="clientes_${today}.csv"`,
        },
      })
    }

    if (entidad === 'pedidos') {
      const csvHeaders = 'ID,Fecha,Cliente,CUIT,Vendedor,Estado,Total,Monto Pagado,Saldo Pendiente,Estado Pago\n'
      const stream = generatorToStream(streamPedidos(), csvHeaders)
      return new NextResponse(stream, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="pedidos_${today}.csv"`,
        },
      })
    }

    // ── Non-streaming exports (small tables, projected select) ────────────────

    let csvContent = ''
    let filename = `${entidad}_${today}.csv`

    // Marcas visibles: ventas sólo exportan productos de sus marcas habilitadas.
    const marcaFilter = await marcaVisibleFilter(session.user)

    if (entidad === 'productos') {
      const isAdmin = session.user.role === 'admin'
      const headers = isAdmin
        ? 'SKU,Nombre,Categoria,Precio,Costo,IVA%,Unidad Venta,Stock Minimo,Activo\n'
        : 'SKU,Nombre,Categoria,Precio,IVA%,Unidad Venta,Activo\n'

      let body = ''
      try {
        const rows = await db
          .select()
          .from(productos)
          .where(and(isNull(productos.deletedAt), ...(marcaFilter ? [marcaFilter] : [])))
          .orderBy(productos.nombre)
        body = rows.map((r) => isAdmin
          ? toCsvRow([r.sku, r.nombre, r.categoria, formatMoney(r.precio), formatMoney(r.costo), r.ivaPct, r.unidadVenta, r.stockMinimo, r.activo])
          : toCsvRow([r.sku, r.nombre, r.categoria, formatMoney(r.precio), r.ivaPct, r.unidadVenta, r.activo])
        ).join('\n')
      } catch (innerErr) {
        const rawMessage = innerErr instanceof Error ? innerErr.message : String(innerErr)
        console.error('[export/productos] full select failed, trying minimal projection:', rawMessage)
        try {
          const rows = await db
            .select({ id: productos.id, nombre: productos.nombre, precio: productos.precio, activo: productos.activo })
            .from(productos)
            .where(and(isNull(productos.deletedAt), ...(marcaFilter ? [marcaFilter] : [])))
            .orderBy(productos.nombre)
          body = rows.map((r) => isAdmin
            ? toCsvRow(['', r.nombre, '', formatMoney(r.precio), '', '', '', '', r.activo])
            : toCsvRow(['', r.nombre, '', formatMoney(r.precio), '', '', r.activo])
          ).join('\n')
        } catch (innerErr2) {
          console.error('[export/productos] minimal projection failed:', innerErr2 instanceof Error ? innerErr2.message : String(innerErr2))
          body = ''
        }
      }
      csvContent = headers + body
      filename = `productos_${today}.csv`

    } else if (entidad === 'leads') {
      const rows = await db.query.leads.findMany({
        where: isNull(leads.deletedAt),
        with: {
          contact: { columns: { name: true, phone: true, email: true } },
          stage: { columns: { name: true } },
          assignedUser: { columns: { name: true } },
        },
        orderBy: [leads.createdAt],
      })
      const headers = 'ID,Contacto,Telefono,Email,Etapa,Asignado a,Fuente,Abierto,Creado\n'
      const body = rows.map((r) =>
        toCsvRow([r.id, r.contact?.name, r.contact?.phone, r.contact?.email, r.stage?.name, r.assignedUser?.name, r.source, r.isOpen, r.createdAt?.toISOString().split('T')[0]])
      ).join('\n')
      csvContent = headers + body
      filename = `leads_${today}.csv`

    } else if (entidad === 'morosos') {
      const [config] = await db.select().from(businessConfig).where(eq(businessConfig.id, 1)).limit(1)
      const morosoDias = config?.clienteMorosoDias ?? 30

      const rows = await db.query.pedidos.findMany({
        where: and(
          isNull(pedidos.deletedAt),
          sql`${pedidos.estadoPago} IN ('impago', 'parcial')`,
          sql`${pedidos.fecha} < NOW() - INTERVAL '${sql.raw(String(morosoDias))} days'`,
        ),
        with: {
          cliente: { columns: { nombre: true, apellido: true, telefono: true, cuit: true } },
          vendedor: { columns: { name: true } },
        },
        orderBy: [pedidos.fecha],
      })
      const headers = 'Cliente,CUIT,Telefono,Vendedor,Fecha Pedido,Dias Vencido,Saldo Pendiente,Estado Pago\n'
      const body = rows.map((r) => {
        const fechaPedido = r.fecha ? new Date(r.fecha) : new Date()
        const diasVencido = Math.floor((Date.now() - fechaPedido.getTime()) / (1000 * 60 * 60 * 24))
        return toCsvRow([
          `${r.cliente?.nombre ?? ''} ${r.cliente?.apellido ?? ''}`.trim(),
          r.cliente?.cuit, r.cliente?.telefono, r.vendedor?.name,
          r.fecha?.toISOString().split('T')[0], diasVencido,
          formatMoney(r.saldoPendiente), r.estadoPago,
        ])
      }).join('\n')
      csvContent = headers + body
      filename = `morosos_${today}.csv`

    } else if (entidad === 'stock') {
      const rows = await db
        .select({
          id: productos.id,
          sku: productos.sku,
          nombre: productos.nombre,
          categoria: productos.categoria,
          unidadVenta: productos.unidadVenta,
          stockMinimo: productos.stockMinimo,
          saldoResultante: stockMovements.saldoResultante,
          ultimoMovimiento: stockMovements.createdAt,
        })
        .from(productos)
        .leftJoin(
          stockMovements,
          sql`${stockMovements.id} = (
            SELECT id FROM stock_movements sm2
            WHERE sm2.producto_id = ${productos.id}
            ORDER BY sm2.created_at DESC
            LIMIT 1
          )`,
        )
        .where(and(isNull(productos.deletedAt), eq(productos.activo, true), ...(marcaFilter ? [marcaFilter] : [])))
        .orderBy(productos.nombre)
      const headers = 'SKU,Nombre,Categoria,Unidad,Stock Actual,Stock Minimo,Bajo Minimo,Ultimo Movimiento\n'
      const body = rows.map((r) => {
        const stockActual = r.saldoResultante ?? 0
        return toCsvRow([r.sku, r.nombre, r.categoria, r.unidadVenta, stockActual, r.stockMinimo, stockActual < r.stockMinimo ? 'SI' : 'NO', r.ultimoMovimiento ? r.ultimoMovimiento.toISOString().split('T')[0] : ''])
      }).join('\n')
      csvContent = headers + body
      filename = `stock_${today}.csv`

    } else {
      return NextResponse.json({ error: 'Entidad no soportada' }, { status: 400 })
    }

    const bom = '﻿'
    return new NextResponse(bom + csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
