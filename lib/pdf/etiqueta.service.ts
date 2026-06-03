import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { db } from '@/db'
import { pedidos, empresaConfig } from '@/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { EtiquetaDocument, type EtiquetaData } from './etiqueta.template'
import { NotFoundError } from '@/lib/errors'

/** Resolve delivery address lines — same logic as the EntregaInfo component in FabricaConfirmadosView */
function resolverEntregaLineas(
  metodoEntrega: 'retiro_fabrica' | 'expreso' | null | undefined,
  expresoNombre: string | null | undefined,
  expresoDireccion: string | null | undefined,
  cliente: {
    direccion: string | null
    localidad: string | null
    provincia: string | null
    codigoPostal: string | null
  },
): string[] {
  if (metodoEntrega === 'retiro_fabrica') {
    return ['RETIRO EN FÁBRICA']
  }

  if (metodoEntrega === 'expreso') {
    const lineas: string[] = []
    if (expresoNombre) lineas.push(`Expreso: ${expresoNombre}`)
    if (expresoDireccion) lineas.push(expresoDireccion)
    return lineas.length > 0 ? lineas : ['Envío por expreso']
  }

  // Default: cliente address
  const lineas: string[] = []
  if (cliente.direccion) lineas.push(cliente.direccion)

  const localLine = [cliente.localidad, cliente.provincia]
    .filter(Boolean)
    .join(', ')
  const cpPart = cliente.codigoPostal ? ` (${cliente.codigoPostal})` : ''
  if (localLine) lineas.push(`${localLine}${cpPart}`)

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
          provincia: true,
          codigoPostal: true,
          telefono: true,
        },
      },
      items: { columns: { id: true } },
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
    pedido.expresoNombre,
    pedido.expresoDireccion,
    pedido.cliente,
  )

  const data: EtiquetaData = {
    pedidoId: pedido.id,
    clienteNombre: pedido.cliente.nombre,
    clienteApellido: pedido.cliente.apellido,
    clienteTelefono: pedido.cliente.telefono ?? undefined,
    entregaLineas,
    empresa: { nombre: config?.nombre ?? '' },
    totalItems: pedido.items.length,
    observaciones: pedido.observaciones ?? undefined,
  }

  const element = React.createElement(
    EtiquetaDocument,
    { data },
  ) as React.ReactElement<DocumentProps>

  const buffer = await renderToBuffer(element)
  return Buffer.from(buffer)
}
