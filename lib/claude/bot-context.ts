/**
 * Contexto que recibe el bot calificador antes de responder.
 *
 * Sin esto el bot arranca "a ciegas": vuelve a saludar, se presenta de nuevo
 * y pregunta datos que el lead ya cargó en el formulario del landing (producto,
 * empresa, localidad) o que el equipo ya le dijo en el mensaje de apertura.
 */

import { CATEGORIAS_BOT_MEDIA, LABEL_CATEGORIA, type CategoriaBotMedia } from './bot-reglas'

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

export const HANDOFF_MARKER = '[HANDOFF]'
export const RESUMEN_MARKER = '[RESUMEN]'

/**
 * Separa lo que ve el cliente de lo que es para el equipo. El bot, al derivar,
 * escribe el cierre, luego [HANDOFF] y un bloque [RESUMEN] con los datos
 * relevados. Nada de eso debe llegar al cliente: se saca del texto visible y
 * el resumen se guarda como nota interna.
 */
export function separarResumen(respuesta: string): { visible: string; resumen: string | null; handoff: boolean } {
  const handoff = respuesta.includes(HANDOFF_MARKER)
  const idx = respuesta.indexOf(RESUMEN_MARKER)
  const antes = idx >= 0 ? respuesta.slice(0, idx) : respuesta
  const resumen = idx >= 0 ? respuesta.slice(idx + RESUMEN_MARKER.length).replace(HANDOFF_MARKER, '').trim() : null
  const visible = antes.replace(HANDOFF_MARKER, '').trim()
  return { visible, resumen: resumen || null, handoff }
}

/**
 * Instrucción fija (va siempre al system prompt, con o sin datos previos):
 * si no sabemos la empresa / marca, el bot la pregunta una vez en un momento
 * natural, y en el bloque [RESUMEN] deja una línea "Empresa: ..." para que
 * el sistema la guarde en el lead (ver extraerEmpresa).
 */
export function armarInstruccionEmpresa(empresaConocida: string | null | undefined): string {
  const lineas = ['## Empresa / marca']
  if (empresaConocida?.trim()) {
    lineas.push(`Ya sabemos que es de "${empresaConocida.trim()}": no lo vuelvas a preguntar.`)
  } else {
    lineas.push(
      'Todavía no sabemos el nombre de su empresa, negocio o marca. Preguntalo UNA sola vez, en un momento natural ' +
        '(por ejemplo, después de saber qué busca): "¿Cómo se llama tu empresa o marca?". Si dice que es particular o ' +
        'no tiene, no insistas.',
    )
  }
  lineas.push(
    'En el bloque [RESUMEN] final incluí siempre una línea con el formato exacto "Empresa: <nombre>" ' +
      '(o "Empresa: -" si no tiene o no lo dijo).',
  )
  return lineas.join('\n')
}

const EMPRESA_VACIA = new Set([
  '-', '--', '—', 'no', 'n/a', 'na', 'ninguna', 'ninguno', 'no tiene', 'no dijo', 'no lo dijo', 'no indica',
  'no especificada', 'no especificado', 'sin datos', 'sin empresa', 'particular', 'desconocida', 'desconocido',
  'no aplica', 'null', 'ndc', 'n.d.', 'nd',
])

/** Lee "Empresa: X" (o "Empresa / marca: X") del bloque [RESUMEN]; null si falta o dice que no tiene. */
export function extraerEmpresa(resumen: string | null | undefined): string | null {
  if (!resumen) return null
  const m = /^\s*[-*•]?\s*empresa(?:\s*(?:\/|o)\s*marca)?\s*:\s*(.+?)\s*$/im.exec(resumen)
  if (!m) return null
  const valor = m[1]!.replace(/^["'“”]+|["'“”.]+$/g, '').replace(/\s+/g, ' ').trim()
  if (!valor || valor.length > 200) return null
  if (EMPRESA_VACIA.has(valor.toLowerCase())) return null
  if (/^(no |sin |ningun)/i.test(valor)) return null
  return valor
}

/** Lee "Score: X/14, grado A/B/C" del bloque [RESUMEN] (tolerante al formato). */
export function extraerScore(resumen: string | null | undefined): { score: number | null; grado: 'A' | 'B' | 'C' | null } {
  if (!resumen) return { score: null, grado: null }
  const scoreMatch = /score\s*:?\s*(\d{1,2})\s*\/\s*14/i.exec(resumen)
  const gradoMatch = /grado\s*:?\s*([ABC])\b/i.exec(resumen) ?? /\(\s*([ABC])\s*\)/.exec(resumen)
  const score = scoreMatch ? Math.min(14, parseInt(scoreMatch[1]!, 10)) : null
  const grado = gradoMatch ? (gradoMatch[1]!.toUpperCase() as 'A' | 'B' | 'C') : null
  return { score, grado }
}

export const PLAZO_PROPUESTA_DEFAULT = 'hoy mismo en horario hábil'

/**
 * Precio de referencia (Ajustes → Bot). Con precio cargado el bot lo da cuando
 * preguntan y aclara que la propuesta exacta llega por escrito; sin precio,
 * no inventa números pero tampoco dice "no doy precios por acá".
 */
export function armarSeccionPrecio(precio: string | null | undefined, plazo: string = PLAZO_PROPUESTA_DEFAULT): string {
  const lineas = ['## Precio']
  const p = precio?.trim()
  if (p) {
    lineas.push(`Precio de referencia: ${p}.`)
    lineas.push(
      'Si la persona pregunta precio, DALO (este rango, tal cual), sin vueltas y sin pedir más datos antes. ' +
        `Aclará que la propuesta exacta, con el precio final según cantidad y packaging, llega por escrito ${plazo}. ` +
        'Nunca digas que no das precios por acá.',
    )
  } else {
    lineas.push(
      'No hay un precio de referencia cargado: no inventes números. Si preguntan precio, decí que depende de cantidad ' +
        `y packaging y que la propuesta con precios llega por escrito ${plazo}. Nunca digas que no das precios por acá.`,
    )
  }
  return lineas.join('\n')
}

/**
 * Productos que la planta NO hace. Si piden uno: decirlo con amabilidad,
 * ofrecer alternativa y marcar [LISTA_ESPERA: <producto>] (el sistema etiqueta
 * al lead y no lo deriva como calificado).
 */
export function armarSeccionProductosExcluidos(productos: readonly string[] | null | undefined): string {
  const lista = (productos ?? []).map((p) => p.trim()).filter(Boolean)
  if (lista.length === 0) return ''
  return [
    '## Productos que NO hacemos',
    lista.map((p) => `- ${p}`).join('\n'),
    'Si la persona pide alguno de estos (o algo que no sea de pastelería / alfajores):',
    '- Decile con amabilidad que por ahora no lo hacemos y ofrecele la alternativa más parecida de lo que sí hacemos.',
    '- Agregá al final del mensaje el marcador [LISTA_ESPERA: <producto>] usando el nombre tal cual figura en la lista ' +
      '(ej. [LISTA_ESPERA: sin TACC]). No lo repitas si ya lo pusiste en un mensaje anterior por el mismo producto.',
    '- NO lo califiques ni derives al equipo por ese producto: si le interesa la alternativa, seguís calificando normal; ' +
      'si solo quiere lo que no hacemos, despedite diciendo que le avisamos cuando lo tengamos y poné ' +
      '[LISTA_ESPERA: <producto>] junto con [HANDOFF] (así queda anotado en lista de espera, sin pasar a ventas).',
  ].join('\n')
}

/** Cuándo llega la propuesta por escrito: nunca prometer otro plazo. */
export function armarSeccionPlazo(plazo: string | null | undefined): string {
  const p = plazo?.trim() || PLAZO_PROPUESTA_DEFAULT
  return [
    '## Tiempos',
    `La propuesta por escrito sale ${p}. Si preguntan cuándo la reciben, decí exactamente eso. ` +
      'No prometas otro plazo (nada de "72 hs hábiles" ni similares).',
  ].join('\n')
}

/**
 * Galería de medios disponible: el bot pide mandar fotos con [FOTO: <categoría>]
 * (hasta 2 por mensaje) cuando la persona quiere ver el producto, el packaging o la planta.
 */
export function armarSeccionMedios(categoriasDisponibles: readonly CategoriaBotMedia[]): string {
  const cats = CATEGORIAS_BOT_MEDIA.filter((c) => categoriasDisponibles.includes(c))
  if (cats.length === 0) return ''
  return [
    '## Fotos y videos',
    'Tenés medios reales para mandar. Categorías disponibles:',
    cats.map((c) => `- ${c}: ${LABEL_CATEGORIA[c]}`).join('\n'),
    'Si la persona pide ver el producto, el packaging, la bobina impresa o la planta (o preguntás si quiere ver fotos ' +
      'y dice que sí), agregá al final del mensaje [FOTO: <categoría>] con la categoría tal cual figura arriba; máximo 2 ' +
      'marcadores por mensaje. El sistema manda las fotos / videos después de tu texto: escribí algo corto tipo ' +
      '"Te paso unas fotos". No describas imágenes que no mandás ni digas que no podés mandar fotos.',
  ].join('\n')
}
