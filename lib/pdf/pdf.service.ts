import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { db } from '@/db'
import {
  documentCounters,
  documentosEmitidos,
  pedidos,
  empresaConfig,
} from '@/db/schema'
import { eq, sql, and, isNull } from 'drizzle-orm'
import { RemitoDocument } from './remito.template'
import { ProformaDocument } from './proforma.template'
import { NotFoundError } from '@/lib/errors'

export type EmitirDocumentoResult = {
  buffer: Buffer
  numero: number
}

export async function emitirDocumento(
  pedidoId: string,
  tipo: 'remito' | 'proforma',
  emitidoPor: string,
): Promise<EmitirDocumentoResult> {
  // 1. Fetch pedido with all relations
  const pedido = await db.query.pedidos.findFirst({
    where: and(eq(pedidos.id, pedidoId), isNull(pedidos.deletedAt)),
    with: {
      cliente: true,
      vendedor: { columns: { id: true, name: true } },
      items: {
        with: {
          producto: { columns: { id: true, nombre: true } },
        },
      },
    },
  })

  if (!pedido) throw new NotFoundError('Pedido')

  // 2. Fetch empresa config (id = 1)
  const [config] = await db
    .select()
    .from(empresaConfig)
    .where(eq(empresaConfig.id, 1))
    .limit(1)

  const empresa = {
    nombre: config?.nombre ?? '',
    direccion: config?.direccion ?? undefined,
    telefono: config?.telefono ?? undefined,
    email: config?.email ?? undefined,
  }

  // 3. Transaction with locking on document_counters
  let newNumber = 0

  await db.transaction(async (tx) => {
    // Lock the counter row
    await tx.execute(
      sql`SELECT * FROM document_counters WHERE tipo = ${tipo} FOR UPDATE`,
    )

    // Fetch current counter (upsert if missing)
    const [counter] = await tx
      .insert(documentCounters)
      .values({ tipo, lastNumber: 0 })
      .onConflictDoUpdate({
        target: documentCounters.tipo,
        set: { lastNumber: documentCounters.lastNumber },
      })
      .returning()

    newNumber = (counter?.lastNumber ?? 0) + 1

    // Update counter
    await tx
      .update(documentCounters)
      .set({ lastNumber: newNumber })
      .where(eq(documentCounters.tipo, tipo))

    // Insert document record
    await tx.insert(documentosEmitidos).values({
      tipo,
      numero: newNumber,
      pedidoId,
      emitidoPor,
    })
  })

  // 4. Build PedidoData
  const pedidoData = {
    id: pedido.id,
    fecha: pedido.fecha,
    clienteNombre: pedido.cliente.nombre,
    clienteApellido: pedido.cliente.apellido,
    clienteDireccion: pedido.cliente.direccion ?? undefined,
    clienteCuit: pedido.cliente.cuit ?? undefined,
    clienteTelefono: pedido.cliente.telefono ?? undefined,
    items: pedido.items.map((item) => ({
      productoNombre: item.producto?.nombre ?? 'Producto',
      cantidad: item.cantidad,
      precioUnitario: item.precioUnitario,
      subtotal: item.subtotal,
    })),
    total: pedido.total,
    vendedorNombre: pedido.vendedor?.name ?? 'Vendedor',
    empresa,
  }

  // 5. Render PDF
  let element: React.ReactElement<DocumentProps>

  if (tipo === 'remito') {
    element = React.createElement(RemitoDocument, { data: pedidoData, numero: newNumber }) as React.ReactElement<DocumentProps>
  } else {
    element = React.createElement(ProformaDocument, {
      data: pedidoData,
      numero: newNumber,
      saldoPendiente: pedido.saldoPendiente,
    }) as React.ReactElement<DocumentProps>
  }

  const buffer = await renderToBuffer(element)

  return { buffer: Buffer.from(buffer), numero: newNumber }
}
