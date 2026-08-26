/**
 * Contexto que recibe el bot calificador antes de responder.
 *
 * Sin esto el bot arranca "a ciegas": vuelve a saludar, se presenta de nuevo
 * y pregunta datos que el lead ya cargó en el formulario del landing (producto,
 * empresa, localidad) o que el equipo ya le dijo en el mensaje de apertura.
 */

export type DatosLeadParaBot = {
  contactName?: string | null
  empresa?: string | null
  productoInteres?: string | null
  localidad?: string | null
  direccion?: string | null
  /** Notas del lead (el intake guarda ahí el resumen del formulario) */
  notas?: string | null
}

export type TurnoClaude = { role: 'user' | 'assistant'; content: string }

/** Forma mínima de un mensaje guardado, suficiente para armar el historial. */
export type MensajeHistorial = {
  senderType: string | null
  contentType: string | null
  direction?: string | null
  body: string | null
}

const MAX_NOTAS = 1500

/**
 * Bloque de texto con lo que ya sabemos del lead, para sumar al system prompt.
 * Devuelve '' si no hay ningún dato.
 */
export function armarContextoLead(datos: DatosLeadParaBot, mensajesPreviosDelEquipo: string[] = []): string {
  const lineas: string[] = []
  if (datos.contactName?.trim()) lineas.push(`- Nombre: ${datos.contactName.trim()}`)
  if (datos.empresa?.trim()) lineas.push(`- Empresa: ${datos.empresa.trim()}`)
  if (datos.productoInteres?.trim()) lineas.push(`- Producto que le interesa: ${datos.productoInteres.trim()}`)
  if (datos.localidad?.trim()) lineas.push(`- Localidad: ${datos.localidad.trim()}`)
  if (datos.direccion?.trim()) lineas.push(`- Dirección: ${datos.direccion.trim()}`)
  if (datos.notas?.trim()) {
    const notas = datos.notas.trim()
    lineas.push(`- Lo que completó en el formulario / notas:\n${notas.length > MAX_NOTAS ? notas.slice(0, MAX_NOTAS) + '…' : notas}`)
  }

  const previos = mensajesPreviosDelEquipo.map((m) => m.trim()).filter(Boolean)

  if (lineas.length === 0 && previos.length === 0) return ''

  const partes: string[] = ['## Lo que ya sabemos de esta persona']
  if (lineas.length > 0) partes.push(lineas.join('\n'))
  if (previos.length > 0) {
    partes.push('El equipo ya le escribió antes de que respondiera. Mensajes enviados:')
    partes.push(previos.map((m) => `> ${m.replace(/\n+/g, ' ')}`).join('\n'))
  }
  partes.push(
    [
      'Reglas:',
      '- NO vuelvas a preguntar nada que ya figure acá (nombre, producto, empresa, etc.). Dalo por sabido y usalo.',
      '- NO vuelvas a saludar ni a presentarte si el equipo ya le escribió: seguí la conversación desde donde está.',
      '- Si un dato figura acá pero la persona dice otra cosa, vale lo que dice la persona.',
      '- Avanzá directo a lo que falta para cotizar.',
    ].join('\n'),
  )
  return partes.join('\n\n')
}

/**
 * Convierte los mensajes guardados en turnos para Claude.
 * - contacto → user; bot y equipo (agent/system, texto o plantilla) → assistant.
 * - Notas internas y adjuntos sin texto se ignoran.
 * - Turnos consecutivos del mismo rol se unen (la API los pide alternados).
 * - Si la conversación empieza con mensajes del equipo (apertura con plantilla),
 *   esos van aparte en `previosDelEquipo` para meterlos en el system prompt:
 *   el primer turno para Claude tiene que ser del usuario.
 */
export function armarHistorialClaude(history: MensajeHistorial[]): {
  turnos: TurnoClaude[]
  previosDelEquipo: string[]
} {
  const crudos: TurnoClaude[] = []
  for (const msg of history) {
    if (msg.contentType === 'internal_note') continue
    const body = (msg.body ?? '').trim()
    if (!body) continue

    if (msg.senderType === 'contact') {
      crudos.push({ role: 'user', content: body })
    } else if (msg.senderType === 'bot' || msg.senderType === 'agent' || msg.senderType === 'system') {
      if (msg.contentType === 'text' || msg.contentType === 'template') {
        crudos.push({ role: 'assistant', content: body })
      }
    }
  }

  const previosDelEquipo: string[] = []
  while (crudos.length > 0 && crudos[0]!.role === 'assistant') {
    previosDelEquipo.push(crudos.shift()!.content)
  }

  const turnos: TurnoClaude[] = []
  for (const t of crudos) {
    const ultimo = turnos.at(-1)
    if (ultimo && ultimo.role === t.role) ultimo.content = `${ultimo.content}\n\n${t.content}`
    else turnos.push({ ...t })
  }

  return { turnos, previosDelEquipo }
}
