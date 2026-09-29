/**
 * Envíos masivos: listado y detalle para la pantalla. El detalle junta cada
 * destinatario con el estado de entrega de su mensaje (tildes del webhook) y
 * si el lead respondió después del envío.
 */
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  contacts, enviosMasivos, enviosMasivosDestinatarios, leads, messages, pipelineStages, users,
} from '@/db/schema'
import { NotFoundError } from '@/lib/errors'

export type EnvioResumen = {
  id: string
  nombre: string
  templateName: string
  estado: 'programado' | 'enviando' | 'completado' | 'cancelado'
  programadoAt: string
  iniciadoAt: string | null
  finalizadoAt: string | null
  total: number
  enviados: number
  fallidos: number
  omitidos: number
  creadoPorNombre: string | null
  createdAt: string
}

export async function listarEnvios(limite = 50): Promise<EnvioResumen[]> {
  const rows = await db
    .select({ e: enviosMasivos, creadoPorNombre: users.name })
    .from(enviosMasivos)
    .leftJoin(users, eq(users.id, enviosMasivos.creadoPor))
    .orderBy(desc(enviosMasivos.createdAt))
    .limit(limite)
  return rows.map(({ e, creadoPorNombre }) => ({
    id: e.id,
    nombre: e.nombre,
    templateName: e.templateName,
    estado: e.estado,
    programadoAt: e.programadoAt.toISOString(),
    iniciadoAt: e.iniciadoAt?.toISOString() ?? null,
    finalizadoAt: e.finalizadoAt?.toISOString() ?? null,
    total: e.total,
    enviados: e.enviados,
    fallidos: e.fallidos,
    omitidos: e.omitidos,
    creadoPorNombre,
    createdAt: e.createdAt.toISOString(),
  }))
}

export type DestinatarioDetalle = {
  id: string
  leadId: string
  conversationId: string | null
  nombre: string
  empresa: string | null
  etapa: string | null
  estado: 'pendiente' | 'enviado' | 'fallido' | 'omitido' | 'cancelado'
  motivo: string | null
  enviadoAt: string | null
  /** Tildes: sent | delivered | read | failed (null si todavía no salió) */
  waStatus: string | null
  respondio: boolean
}

export type EnvioDetalle = EnvioResumen & {
  templateBody: string
  filtros: Record<string, unknown>
  entregados: number
  leidos: number
  respondieron: number
  destinatarios: DestinatarioDetalle[]
}

export async function detalleEnvio(envioId: string): Promise<EnvioDetalle> {
  const [resumen] = await db
    .select({ e: enviosMasivos, creadoPorNombre: users.name })
    .from(enviosMasivos)
    .leftJoin(users, eq(users.id, enviosMasivos.creadoPor))
    .where(eq(enviosMasivos.id, envioId))
  if (!resumen) throw new NotFoundError('Envío')
  const e = resumen.e

  const dest = await db
    .select({
      d: enviosMasivosDestinatarios,
      nombre: contacts.name,
      empresa: leads.empresa,
      etapa: pipelineStages.name,
      waStatus: messages.waStatus,
    })
    .from(enviosMasivosDestinatarios)
    .innerJoin(leads, eq(leads.id, enviosMasivosDestinatarios.leadId))
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .leftJoin(pipelineStages, eq(pipelineStages.id, leads.stageId))
    .leftJoin(messages, eq(messages.id, enviosMasivosDestinatarios.messageId))
    .where(eq(enviosMasivosDestinatarios.envioId, envioId))
    .orderBy(desc(enviosMasivosDestinatarios.enviadoAt), desc(enviosMasivosDestinatarios.createdAt))

  // ¿Respondió? Algún mensaje entrante en su conversación después del envío
  const enviados = dest.filter((r) => r.d.estado === 'enviado' && r.d.conversationId && r.d.enviadoAt)
  const respondieronIds = new Set<string>()
  if (enviados.length > 0) {
    const convIds = [...new Set(enviados.map((r) => r.d.conversationId!))]
    const minEnviado = new Date(Math.min(...enviados.map((r) => r.d.enviadoAt!.getTime())))
    const entrantes = await db
      .select({ conversationId: messages.conversationId, primero: sql<Date>`min(${messages.sentAt})` })
      .from(messages)
      .where(and(inArray(messages.conversationId, convIds), eq(messages.direction, 'inbound'), gt(messages.sentAt, minEnviado)))
      .groupBy(messages.conversationId)
    const primeroPorConv = new Map(entrantes.map((x) => [x.conversationId, x.primero instanceof Date ? x.primero : new Date(x.primero)]))
    for (const r of enviados) {
      const primero = primeroPorConv.get(r.d.conversationId!)
      if (primero && primero.getTime() > r.d.enviadoAt!.getTime()) respondieronIds.add(r.d.id)
    }
  }

  const destinatarios: DestinatarioDetalle[] = dest.map((r) => ({
    id: r.d.id,
    leadId: r.d.leadId,
    conversationId: r.d.conversationId,
    nombre: r.nombre,
    empresa: r.empresa,
    etapa: r.etapa,
    estado: r.d.estado,
    motivo: r.d.motivo,
    enviadoAt: r.d.enviadoAt?.toISOString() ?? null,
    waStatus: r.waStatus,
    respondio: respondieronIds.has(r.d.id),
  }))

  return {
    id: e.id,
    nombre: e.nombre,
    templateName: e.templateName,
    estado: e.estado,
    programadoAt: e.programadoAt.toISOString(),
    iniciadoAt: e.iniciadoAt?.toISOString() ?? null,
    finalizadoAt: e.finalizadoAt?.toISOString() ?? null,
    total: e.total,
    enviados: e.enviados,
    fallidos: e.fallidos,
    omitidos: e.omitidos,
    creadoPorNombre: resumen.creadoPorNombre,
    createdAt: e.createdAt.toISOString(),
    templateBody: e.templateBody,
    filtros: (e.filtros ?? {}) as Record<string, unknown>,
    entregados: destinatarios.filter((d) => d.waStatus === 'delivered' || d.waStatus === 'read').length,
    leidos: destinatarios.filter((d) => d.waStatus === 'read').length,
    respondieron: respondieronIds.size,
    destinatarios,
  }
}
