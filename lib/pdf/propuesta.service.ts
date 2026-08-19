import React from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { db } from '@/db'
import { propuestas, empresaConfig } from '@/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { NotFoundError, ConflictError } from '@/lib/errors'
import {
  PropuestaDocument,
  formatNumeroPropuesta,
  type PropuestaPdfData,
  type PropuestaEscenarioPdf,
} from './propuesta.template'

type PropuestaRow = typeof propuestas.$inferSelect

type ContactoLead = {
  name: string
  phone: string | null
  email: string | null
}

type EmpresaInfo = {
  nombre: string
  cuit: string | null
  direccion: string | null
  telefono: string | null
  email: string | null
}

export type GenerarPropuestaPdfResult = {
  buffer: Buffer
  numero: number
  filename: string
  leadId: string
  estado: PropuestaRow['estado']
}

// Arma los datos del PDF EXCLUSIVAMENTE desde el snapshot y el resultado
// congelados en la propuesta — nunca desde la config vigente del cotizador.
// Exportada para poder testear esa garantía en aislamiento.
export function armarDatosPropuestaPdf(
  propuesta: PropuestaRow,
  contacto: ContactoLead,
  empresaLead: string | null,
  vendedorNombre: string,
  empresa: EmpresaInfo,
): PropuestaPdfData {
  const snapshot = propuesta.snapshot as { validezDias?: number; condicionesComerciales?: string | null }
  const resultado = propuesta.resultado as { escenarios?: PropuestaEscenarioPdf[] }

  return {
    numero: propuesta.numero,
    fechaEmision: propuesta.createdAt,
    vigenteHasta: propuesta.vigenteHasta,
    cliente: {
      nombre: contacto.name,
      empresa: empresaLead,
      telefono: contacto.phone,
      email: contacto.email,
    },
    cantidad: propuesta.cantidad,
    gramaje: propuesta.gramaje,
    packaging: propuesta.packaging,
    escenarios: resultado.escenarios ?? [],
    condicionesComerciales: snapshot.condicionesComerciales ?? null,
    validezDias: snapshot.validezDias ?? 7,
    vendedorNombre,
    empresa,
  }
}

export async function generarPropuestaPdf(propuestaId: string): Promise<GenerarPropuestaPdfResult> {
  const propuesta = await db.query.propuestas.findFirst({
    where: and(eq(propuestas.id, propuestaId), isNull(propuestas.deletedAt)),
    with: {
      lead: { with: { contact: true } },
      creadoPor: { columns: { name: true } },
    },
  })
  if (!propuesta) throw new NotFoundError('Propuesta')

  if (propuesta.estado === 'pendiente_aprobacion') {
    throw new ConflictError(
      'La propuesta está pendiente de aprobación del descuento: un administrador debe aprobarla antes de generar el PDF.',
    )
  }

  const [config] = await db
    .select()
    .from(empresaConfig)
    .where(eq(empresaConfig.id, 1))
    .limit(1)

  // La empresa del cliente vive en customFields.empresa del lead
  const customFields = propuesta.lead.customFields as Record<string, unknown>
  const empresaLead = typeof customFields['empresa'] === 'string' ? customFields['empresa'] : null

  const data = armarDatosPropuestaPdf(
    propuesta,
    {
      name: propuesta.lead.contact.name,
      phone: propuesta.lead.contact.phone,
      email: propuesta.lead.contact.email,
    },
    empresaLead,
    propuesta.creadoPor.name ?? 'Vendedor',
    {
      nombre: config?.nombre || 'ALIPRO',
      cuit: config?.cuit ?? null,
      direccion: config?.direccion ?? null,
      telefono: config?.telefono ?? null,
      email: config?.email ?? null,
    },
  )

  const element = React.createElement(PropuestaDocument, { data }) as React.ReactElement<DocumentProps>
  const buffer = await renderToBuffer(element)

  return {
    buffer: Buffer.from(buffer),
    numero: propuesta.numero,
    filename: `${formatNumeroPropuesta(propuesta.numero)}.pdf`,
    leadId: propuesta.leadId,
    estado: propuesta.estado,
  }
}
