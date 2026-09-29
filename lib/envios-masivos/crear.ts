/**
 * Envíos masivos: creación. Valida la plantilla (aprobada, de texto, usable
 * fuera de un pedido), vuelve a evaluar a cada lead elegido y guarda el envío
 * con sus destinatarios. Los que no pueden recibirla quedan como "omitidos"
 * con el motivo, así el envío muestra el cuadro completo.
 */
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { enviosMasivos, enviosMasivosDestinatarios, whatsappTemplates } from '@/db/schema'
import { ValidationError } from '@/lib/errors'
import { plantillaUsableEnChat, variablesParaChat } from '@/lib/whatsapp/apertura'
import { buscarCandidatos, type FiltrosEnvio } from './candidatos'
import { MOTIVO_EXCLUSION_LABEL, momentoDeEnvio } from './reglas'

export type CrearEnvioInput = {
  nombre: string
  templateName: string
  templateLang: string
  filtros: FiltrosEnvio
  /** Leads que el usuario dejó tildados en la vista previa */
  leadIds: string[]
  /** null = ahora */
  programadoAt: Date | null
  creadoPor: string
}

export type PlantillaEnvio = { name: string; language: string; bodyText: string; variables: unknown }

/** Plantilla aprobada, de texto (sin encabezado de archivo) y sin variables de pedido. */
export async function validarPlantillaEnvio(templateName: string, templateLang: string): Promise<PlantillaEnvio> {
  const tmpl = await db.query.whatsappTemplates.findFirst({
    where: and(
      eq(whatsappTemplates.name, templateName),
      eq(whatsappTemplates.language, templateLang),
      eq(whatsappTemplates.status, 'APPROVED'),
    ),
    columns: { name: true, language: true, bodyText: true, variables: true, headerFormat: true },
  })
  if (!tmpl) {
    throw new ValidationError(`La plantilla "${templateName}" (${templateLang}) no está aprobada en WhatsApp. Sincronizá en Ajustes → WhatsApp → Plantillas.`)
  }
  if (tmpl.headerFormat && tmpl.headerFormat !== 'TEXT') {
    throw new ValidationError('Los envíos masivos solo admiten plantillas de texto (sin imagen ni documento en el encabezado).')
  }
  if (!plantillaUsableEnChat(variablesParaChat(tmpl.bodyText, tmpl.variables))) {
    throw new ValidationError('Esa plantilla usa variables de pedido (número, total) y no se puede mandar a leads.')
  }
  return { name: tmpl.name, language: tmpl.language, bodyText: tmpl.bodyText, variables: tmpl.variables }
}

export type EnvioCreado = {
  id: string
  programadoAt: Date
  total: number
  omitidos: number
  /** true si arranca ya (quedó dentro del horario permitido) */
  inmediato: boolean
}

export async function crearEnvioMasivo(input: CrearEnvioInput): Promise<EnvioCreado> {
  const nombre = input.nombre.trim()
  if (!nombre) throw new ValidationError('Poné un nombre al envío (p. ej. "Seguimiento propuestas septiembre")')
  if (input.leadIds.length === 0) throw new ValidationError('Elegí al menos un destinatario')

  const plantilla = await validarPlantillaEnvio(input.templateName, input.templateLang)

  // Se vuelve a evaluar en el servidor: el cliente pudo mandar ids viejos o de otro filtro
  const candidatos = await buscarCandidatos(input.filtros, plantilla.name)
  const porId = new Map(candidatos.map((c) => [c.leadId, c]))
  const elegidos = input.leadIds.filter((id) => porId.has(id))
  if (elegidos.length === 0) throw new ValidationError('Ninguno de los leads elegidos cumple los filtros actuales')

  const ahora = new Date()
  const programadoAt = momentoDeEnvio(input.programadoAt, ahora)
  const inmediato = programadoAt.getTime() <= ahora.getTime() + 1000

  const [envio] = await db
    .insert(enviosMasivos)
    .values({
      nombre,
      templateName: plantilla.name,
      templateLang: plantilla.language,
      templateBody: plantilla.bodyText,
      filtros: input.filtros,
      estado: 'programado',
      programadoAt,
      total: elegidos.length,
      omitidos: elegidos.filter((id) => porId.get(id)!.excluido).length,
      creadoPor: input.creadoPor,
    })
    .returning({ id: enviosMasivos.id })

  await db.insert(enviosMasivosDestinatarios).values(
    elegidos.map((id) => {
      const c = porId.get(id)!
      return {
        envioId: envio!.id,
        leadId: id,
        conversationId: c.conversationId,
        estado: c.excluido ? ('omitido' as const) : ('pendiente' as const),
        motivo: c.excluido ? MOTIVO_EXCLUSION_LABEL[c.excluido] : null,
      }
    }),
  )

  return {
    id: envio!.id,
    programadoAt,
    total: elegidos.length,
    omitidos: elegidos.filter((id) => porId.get(id)!.excluido).length,
    inmediato,
  }
}

/** Cancela un envío programado o en curso: los destinatarios pendientes no salen. */
export async function cancelarEnvioMasivo(envioId: string): Promise<{ cancelados: number }> {
  const envio = await db.query.enviosMasivos.findFirst({ where: eq(enviosMasivos.id, envioId), columns: { id: true, estado: true } })
  if (!envio) throw new ValidationError('El envío no existe')
  if (envio.estado === 'completado' || envio.estado === 'cancelado') {
    throw new ValidationError(`El envío ya está ${envio.estado}`)
  }
  const rows = await db
    .update(enviosMasivosDestinatarios)
    .set({ estado: 'cancelado', motivo: 'Envío cancelado' })
    .where(and(eq(enviosMasivosDestinatarios.envioId, envioId), inArray(enviosMasivosDestinatarios.estado, ['pendiente'])))
    .returning({ id: enviosMasivosDestinatarios.id })
  await db
    .update(enviosMasivos)
    .set({ estado: 'cancelado', finalizadoAt: new Date(), updatedAt: new Date() })
    .where(eq(enviosMasivos.id, envioId))
  return { cancelados: rows.length }
}
