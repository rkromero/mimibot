/**
 * Envíos masivos: quiénes entran en el grupo. Aplica los filtros del pipeline
 * (etapa, vendedor, etiqueta, fuente, fecha de creación) y marca a cada lead
 * con el motivo de exclusión si no puede recibir la plantilla.
 */
import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  contacts, conversations, enviosMasivos, enviosMasivosDestinatarios, leadTags, leads, pipelineStages, users,
} from '@/db/schema'
import { parseFechaAR } from '@/lib/dates'
import { DIAS_ANTIREPETICION, MAX_DESTINATARIOS, motivoExclusion, type MotivoExclusion } from './reglas'

export type FiltrosEnvio = {
  stageId?: string | null
  assignedTo?: string | null
  tagId?: string | null
  source?: 'whatsapp' | 'landing' | 'manual' | null
  /** "YYYY-MM-DD" (hora Argentina), inclusive */
  creadoDesde?: string | null
  creadoHasta?: string | null
}

export type Candidato = {
  leadId: string
  nombre: string
  empresa: string | null
  telefono: string | null
  etapa: string | null
  asignadoNombre: string | null
  productInterest: string | null
  conversationId: string | null
  excluido: MotivoExclusion | null
}

/**
 * Leads que cumplen los filtros, con su conversación de WhatsApp y el motivo
 * de exclusión para la plantilla dada (o null si pueden recibirla).
 * Devuelve como mucho MAX_DESTINATARIOS, los más recientes primero.
 */
export async function buscarCandidatos(filtros: FiltrosEnvio, templateName: string): Promise<Candidato[]> {
  const conds = [isNull(leads.deletedAt)]
  if (filtros.stageId) conds.push(eq(leads.stageId, filtros.stageId))
  if (filtros.assignedTo) conds.push(eq(leads.assignedTo, filtros.assignedTo))
  if (filtros.source) conds.push(eq(leads.source, filtros.source))
  if (filtros.creadoDesde) conds.push(gte(leads.createdAt, parseFechaAR(filtros.creadoDesde)))
  if (filtros.creadoHasta) {
    const hasta = parseFechaAR(filtros.creadoHasta)
    conds.push(lte(leads.createdAt, new Date(hasta.getTime() + 86_400_000 - 1)))
  }
  if (filtros.tagId) {
    const conTag = db.select({ leadId: leadTags.leadId }).from(leadTags).where(eq(leadTags.tagId, filtros.tagId))
    conds.push(inArray(leads.id, conTag))
  }

  const rows = await db
    .select({
      leadId: leads.id,
      isOpen: leads.isOpen,
      nombre: contacts.name,
      empresa: leads.empresa,
      productInterest: leads.productInterest,
      etapa: pipelineStages.name,
      asignadoNombre: users.name,
    })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .leftJoin(pipelineStages, eq(pipelineStages.id, leads.stageId))
    .leftJoin(users, eq(users.id, leads.assignedTo))
    .where(and(...conds))
    .orderBy(desc(leads.createdAt))
    .limit(MAX_DESTINATARIOS)

  if (rows.length === 0) return []
  const ids = rows.map((r) => r.leadId)

  // Conversación de WhatsApp de cada lead (la más reciente si hubiera varias)
  const convs = await db
    .select({ id: conversations.id, leadId: conversations.leadId, phone: conversations.waContactPhone, last: conversations.lastMessageAt })
    .from(conversations)
    .where(inArray(conversations.leadId, ids))
    .orderBy(desc(conversations.lastMessageAt))
  const convPorLead = new Map<string, { id: string; phone: string | null }>()
  for (const c of convs) {
    if (c.leadId && !convPorLead.has(c.leadId)) convPorLead.set(c.leadId, { id: c.id, phone: c.phone })
  }

  // Última vez que recibieron ESTA plantilla por un envío masivo
  const limite = new Date(Date.now() - DIAS_ANTIREPETICION * 86_400_000)
  const previos = await db
    .select({ leadId: enviosMasivosDestinatarios.leadId, ultimo: sql<Date>`max(${enviosMasivosDestinatarios.enviadoAt})` })
    .from(enviosMasivosDestinatarios)
    .innerJoin(enviosMasivos, eq(enviosMasivos.id, enviosMasivosDestinatarios.envioId))
    .where(and(
      inArray(enviosMasivosDestinatarios.leadId, ids),
      eq(enviosMasivosDestinatarios.estado, 'enviado'),
      eq(enviosMasivos.templateName, templateName),
      gte(enviosMasivosDestinatarios.enviadoAt, limite),
    ))
    .groupBy(enviosMasivosDestinatarios.leadId)
  const ultimoPorLead = new Map(previos.map((p) => [p.leadId, p.ultimo instanceof Date ? p.ultimo : new Date(p.ultimo)]))

  const ahora = new Date()
  return rows.map((r) => {
    const conv = convPorLead.get(r.leadId) ?? null
    return {
      leadId: r.leadId,
      nombre: r.nombre,
      empresa: r.empresa,
      telefono: conv?.phone ?? null,
      etapa: r.etapa,
      asignadoNombre: r.asignadoNombre,
      productInterest: r.productInterest,
      conversationId: conv?.id ?? null,
      excluido: motivoExclusion(
        { isOpen: r.isOpen, waContactPhone: conv?.phone ?? null, ultimoEnvioMismaPlantillaAt: ultimoPorLead.get(r.leadId) ?? null },
        ahora,
      ),
    }
  })
}
