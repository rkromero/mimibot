import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { db } from '@/db'
import { pedidos, empresaConfig } from '@/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { EtiquetaDocument, type EtiquetaData } from './etiqueta.template'
import { NotFoundError } from '@/lib/errors'

function resolverEntregaLineas(
  metodoEntrega: 'retiro_fabrica' | 'expreso' | null | undefined,
  cliente: {
    direccion: string | null
    localidad: string | null
    codigoPostal: string | null
    telefono: string | null
  },
): string[] {
  if (metodoEntrega === 'retiro_fabrica') {
    return ['RETIRO EN FÁBRICA']
  }

  // Both expreso and default: always show client delivery address
  const lineas: string[] = []
  if (cliente.direccion) lineas.push(cliente.direccion)
  if (cliente.localidad) lineas.push(cliente.localidad)
  if (cliente.codigoPostal) lineas.push(cliente.codigoPostal)
  if (cliente.telefono) lineas.push(cliente.telefono)

  return lineas.length > 0 ? lineas : ['Sin dirección registrada']
}

export async function generarEtiquetaEnvio(pedidoId: string): Promise<Buffer> {
  const pedido = await db.query.pedidos.findFirst({
    where: and(eq(pedidos.id, pedidoId), isNull(pedidos.deletedAt)),
    with: {
      cliente: {
        columns: {
          nombre: true,
          apellido: true,
          direccion: true,
          localidad: true,
          codigoPostal: true,
          telefono: true,
        },
      },
      items: {
        columns: { id: true },
        with: {
          producto: {
            columns: { id: true },
            with: { marca: { columns: { nombre: true } } },
          },
        },
      },
    },
  })

  if (!pedido) throw new NotFoundError('Pedido')

  const [config] = await db
    .select({ nombre: empresaConfig.nombre })
    .from(empresaConfig)
    .where(eq(empresaConfig.id, 1))
    .limit(1)

  const entregaLineas = resolverEntregaLineas(
    pedido.metodoEntrega as 'retiro_fabrica' | 'expreso' | null,
    pedido.cliente,
  )

  // Marcas únicas de los productos del pedido, en orden de aparición.
  const marcaNombres = [...new Set(
    pedido.items
      .map((item) => item.producto?.marca?.nombre)
      .filter((n): n is string => !!n),
  )]

  const data: EtiquetaData = {
    pedidoId: pedido.id,
    clienteNombre: pedido.cliente.nombre,
    clienteApellido: pedido.cliente.apellido,
    clienteTelefono: pedido.cliente.telefono ?? undefined,
    entregaLineas,
    empresa: { nombre: config?.nombre ?? '' },
    marcaTitulo: marcaNombres.length > 0 ? marcaNombres.join(' + ') : undefined,
    observaciones: pedido.observaciones ?? undefined,
  }

  const element = React.createElement(
    EtiquetaDocument,
    { data },
  ) as React.ReactElement<DocumentProps>

  const buffer = await renderToBuffer(element)
  return Buffer.from(buffer)
}
