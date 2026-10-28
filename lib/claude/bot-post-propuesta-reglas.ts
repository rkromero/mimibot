/**
 * Modo post-propuesta del bot: reglas puras (sin base de datos).
 *
 * Después de que la propuesta sale por WhatsApp, el bot sigue la charla con
 * otro objetivo: saber si la vio y si le cierran los números, responder dudas
 * con los datos reales de la propuesta, ofrecer la muestra SOLO si quiere
 * probar el producto, y llevarlo al primer pedido. Acá viven el prompt por
 * defecto, las secciones de contexto y el parser de los marcadores que deja
 * el modelo ([MUESTRA], [PEDIDO], [HANDOFF] + [RESUMEN]).
 * Lo que toca la base está en bot-post-propuesta.ts.
 */
import { HANDOFF_MARKER, separarResumen } from './bot-context'
import { formatNumeroPropuesta, formatPesos } from './bot-cotizacion'
import type { MetodoEntregaMuestra } from '@/lib/leads/muestra.service'
import { MINUTOS_ESPERA_PROPUESTA } from '@/lib/followup/propuesta-vista'

export const MUESTRA_MARKER = '[MUESTRA]'
export const PEDIDO_MARKER = '[PEDIDO]'

/** Expreso con el que se despachan todas las muestras (nombre y dirección del wizard). */
export const EXPRESO_MUESTRA = 'VIA CARGO'

export const POST_PROPUESTA_MAX_TURNS_DEFAULT = 12

export const DEFAULT_POST_PROPUESTA_PROMPT = `Sos el asistente comercial de ALIPRO (fábrica de alfajores para terceros). A esta persona ya le mandamos la propuesta por escrito por este mismo chat. Tu trabajo ahora es acompañarla hasta el primer pedido, con calidez y sin presionar.

Cómo seguir la charla, en este orden:
1. Si todavía no sabés si la vio: preguntale si pudo ver la propuesta y qué le pareció. Si la vio, averiguá si le cierran los números (precio por unidad y total).
2. Si tiene dudas sobre la propuesta: respondelas vos con los datos de la propuesta y el conocimiento que tenés más abajo. No inventes datos que no figuren.
3. Si está de acuerdo con los números: llevala al primer pedido. Preguntale cuántos alfajores negros y cuántos blancos quiere para arrancar.
4. SOLO si pide probar el producto, conocer la calidad o ver cómo llega, ofrecele mandarle una muestra sin cargo. No la ofrezcas si no lo pidió.
5. Si pregunta cuánto tarda el pedido: 72 horas hábiles desde que entra la seña, y le avisamos cuando está listo. Para arrancar se transfiere el 50 % del pedido; los datos para transferir van junto con la proforma.

Nunca hagas descuentos ni cambies precios, plazos o condiciones: si pide descuento o quiere negociar, decile que lo consultás con el equipo y derivá.

Estilo: respuestas cortas (2 o 3 oraciones), una sola pregunta por mensaje, sin listas ni markdown, sin saludar de nuevo ni presentarte, tuteo rioplatense. Respondé en el idioma de la persona.`

export type PropuestaParaBot = {
  numero: number
  cantidad: number
  gramaje: number
  packaging: 'cristal' | 'personalizado'
  /** DD/MM/AAAA */
  vigenteHasta: string | null
  /** DD/MM/AAAA, cuándo se mandó */
  enviadaEl: string | null
  escenarios: Array<{ cantidad: number; precioUnitNeto: number; total: number; elegido: boolean }>
}

/** Sección con los datos reales de la propuesta enviada (lo único que el bot puede afirmar sobre precios). */
export function armarSeccionPropuestaEnviada(p: PropuestaParaBot): string {
  const lineas = [
    '## La propuesta que le mandamos',
    `Propuesta ${formatNumeroPropuesta(p.numero)}${p.enviadaEl ? `, enviada el ${p.enviadaEl}` : ''}: ` +
      `${p.cantidad.toLocaleString('es-AR')} alfajores de ${p.gramaje} g, packaging ${p.packaging}` +
      (p.vigenteHasta ? `, vigente hasta el ${p.vigenteHasta}.` : '.'),
  ]
  if (p.escenarios.length > 0) {
    lineas.push('Escenarios de la propuesta (precio unitario neto sin IVA y total con IVA):')
    for (const e of p.escenarios) {
      lineas.push(
        `- ${e.cantidad.toLocaleString('es-AR')} unidades: ${formatPesos(e.precioUnitNeto)} + IVA por alfajor, total ${formatPesos(e.total)}` +
          (e.elegido ? ' (la cantidad que pidió)' : ''),
      )
    }
  }
  lineas.push(
    'Si pregunta por otra cantidad que no está acá, decile que el precio cambia según el volumen y que se lo pasás confirmado por escrito; no inventes un número.',
  )
  lineas.push(
    `La propuesta YA le llegó: es el PDF "${formatNumeroPropuesta(p.numero)}" que figura en el chat, justo después de que el asistente ` +
      'le dijo que la iba a recibir. Eso ya pasó. NUNCA digas que la cotización está en camino, que un asesor lo va a contactar ' +
      'ni "enseguida te contactamos": la cotización es esa propuesta y la seguís vos.',
    'Si dice que la vio y le parece bien / le cierra / está ok, ya está de acuerdo: no vuelvas a preguntar si la vio, ' +
      'llevala al primer pedido (cuántos negros y cuántos blancos).',
  )
  return lineas.join('\n')
}

/**
 * Cuánto esperar antes de preguntar "¿pudiste verla?": recién pasada una hora
 * de la propuesta. Si la persona solo acusa recibo antes de eso, el bot
 * contesta corto y el sistema pregunta después (ver followup/propuesta-vista).
 */
export function armarSeccionEsperaPropuesta(minutosDesdeEnvio: number, minutosEspera = MINUTOS_ESPERA_PROPUESTA): string {
  const lineas = ['## Cuándo preguntar si la vio']
  if (minutosDesdeEnvio < minutosEspera) {
    lineas.push(
      `La propuesta salió hace ${minutosDesdeEnvio} minuto${minutosDesdeEnvio === 1 ? '' : 's'}: todavía no tuvo tiempo de verla. ` +
        'Si solo agradece o confirma que la recibió ("gracias", "ok", "la veo y te digo"), NO le preguntes si la vio ni qué le ' +
        'parecen los números: respondé corto (de nada, que la vea tranquilo, cualquier duda por acá) y nada más; el sistema le ' +
        'pregunta más tarde. Si en cambio pregunta algo concreto o ya opina sobre la propuesta, seguí normal.',
    )
  } else {
    lineas.push(
      'Ya pasó un rato desde que salió. Si responde algo corto ("ok", "gracias", "dale") y todavía no sabés qué le pareció, ' +
        'preguntale si pudo abrirla y qué le parecieron los números.',
    )
  }
  return lineas.join('\n')
}

export type DatosEntregaLead = {
  direccion?: string | null
  localidad?: string | null
  provincia?: string | null
  codigoPostal?: string | null
  cuit?: string | null
}

export type MuestraYaCargada = {
  /** DD/MM/AAAA */
  fecha: string | null
  metodoEntrega: string | null
  entregada: boolean
}

/**
 * Reglas de la muestra: cuándo ofrecerla, qué preguntar (retiro en fábrica o
 * expreso), qué datos pedir para el expreso y cómo dejarlo en el marcador
 * [MUESTRA] para que el sistema cargue el pedido.
 */
export function armarSeccionMuestra(params: {
  yaCargada: MuestraYaCargada | null
  retiroFabricaInfo: string | null | undefined
  datosLead: DatosEntregaLead
}): string {
  const { yaCargada, datosLead } = params
  const retiro = params.retiroFabricaInfo?.trim()
  const lineas = ['## Muestra']
  if (yaCargada) {
    lineas.push(
      yaCargada.entregada
        ? `Ya recibió una muestra${yaCargada.fecha ? ` (cargada el ${yaCargada.fecha})` : ''}. No ofrezcas otra: preguntale qué le pareció y llevala al primer pedido.`
        : `Ya tiene una muestra cargada${yaCargada.fecha ? ` el ${yaCargada.fecha}` : ''}${yaCargada.metodoEntrega === 'expreso' ? ', sale por expreso' : yaCargada.metodoEntrega === 'retiro_fabrica' ? ', la retira en fábrica' : ''}. No cargues otra ni vuelvas a pedir datos: si pregunta por ella, decile que está en preparación y que le avisamos cuando salga.`,
    )
    return lineas.join('\n')
  }

  lineas.push(
    'La muestra es sin cargo y se ofrece SOLO si la persona quiere probar el producto o conocer la calidad. Si la quiere:',
    '1. Preguntale si la pasa a buscar por la fábrica (o manda a alguien a retirarla) o si se la enviamos por expreso.',
    retiro
      ? `2. Si la retira: decile dónde y cuándo: ${retiro}. No hace falta pedir más datos.`
      : '2. Si la retira: decile que le pasamos la dirección y el horario de la fábrica por este chat. No hace falta pedir más datos.',
    `3. Si va por expreso (siempre ${EXPRESO_MUESTRA}): necesitás dirección completa (calle y número), localidad, provincia, código postal y CUIT o DNI de quien la recibe (lo pide el transporte). Pedí lo que falte, de a un mensaje, sin repetir lo que ya sabemos.`,
  )
  const conocidos: string[] = []
  if (datosLead.direccion?.trim()) conocidos.push(`dirección: ${datosLead.direccion.trim()}`)
  if (datosLead.localidad?.trim()) conocidos.push(`localidad: ${datosLead.localidad.trim()}`)
  if (datosLead.provincia?.trim()) conocidos.push(`provincia: ${datosLead.provincia.trim()}`)
  if (datosLead.codigoPostal?.trim()) conocidos.push(`código postal: ${datosLead.codigoPostal.trim()}`)
  if (datosLead.cuit?.trim()) conocidos.push(`CUIT/DNI: ${datosLead.cuit.trim()}`)
  if (conocidos.length > 0) {
    lineas.push(`Datos que ya tenemos en la ficha (confirmalos, no los vuelvas a pedir): ${conocidos.join('; ')}.`)
  }
  lineas.push(
    'Cuando tengas todo lo necesario, confirmale que cargás la muestra y agregá al FINAL del mensaje este bloque, una línea por dato y con este formato exacto (el sistema lo lee y no lo ve la persona):',
    MUESTRA_MARKER,
    'Entrega: retiro | expreso',
    'Direccion: <calle y número> (o - si retira)',
    'Localidad: <localidad> (o -)',
    'Provincia: <provincia> (o -)',
    'CP: <código postal> (o -)',
    'CUIT: <CUIT o DNI> (o -)',
    'No pongas el bloque hasta tener los datos completos. Ponelo una sola vez.',
  )
  return lineas.join('\n')
}

/** Conocimiento libre cargado en Ajustes → Bot (vida útil, conservación, ingredientes, mínimos...). */
export function armarSeccionConocimiento(conocimiento: string | null | undefined): string {
  const c = conocimiento?.trim()
  if (!c) return ''
  return ['## Lo que sabés del producto y la fábrica', c, 'Si preguntan algo que no está acá ni en la propuesta, decí que lo confirmás con el equipo y derivá.'].join('\n')
}

/** Cuándo cortar: pedido decidido, descuento / negociación, pide una persona. */
export function armarSeccionDerivacionPost(): string {
  return [
    '## Cuándo avisar al equipo',
    `- Cuando te diga cuántos negros y cuántos blancos quiere (o que quiere arrancar aunque no precise la mezcla): confirmale que le cargás el pedido y que le llega la proforma con los datos para la seña, y agregá al final del mensaje ${PEDIDO_MARKER} seguido de ${HANDOFF_MARKER}.`,
    `- Si pide descuento, quiere negociar precio o condiciones, pide hablar con una persona, está molesto, o pregunta algo que no podés responder: contestá breve que lo ves con el equipo y agregá ${HANDOFF_MARKER}.`,
    `- Siempre que pongas ${HANDOFF_MARKER}, agregá después un bloque [RESUMEN] de 2 a 4 líneas para el vendedor: qué dijo de la propuesta, qué quiere (cantidades, muestra, descuento) y qué queda pendiente.`,
    `- No pongas ${HANDOFF_MARKER} si la charla sigue normalmente: en ese caso el equipo no necesita intervenir.`,
  ].join('\n')
}

export type DatosMuestraBot = {
  entrega: MetodoEntregaMuestra
  direccion: string | null
  localidad: string | null
  provincia: string | null
  codigoPostal: string | null
  cuit: string | null
}

export type SenalesPostPropuesta = {
  /** Texto para la persona, sin marcadores ni bloques */
  visible: string
  /** Bloque [MUESTRA] parseado (puede venir incompleto: ver validarDatosMuestra) */
  muestra: DatosMuestraBot | null
  /** Hubo marcador [MUESTRA] aunque no se haya podido leer la entrega */
  muestraMarcada: boolean
  pedido: boolean
  handoff: boolean
  resumen: string | null
}

const VACIO = new Set(['', '-', '--', '—', 'no', 'n/a', 'na', 'nd', 'no dijo', 'no aplica', 'sin datos'])

function limpiar(v: string | undefined): string | null {
  const t = (v ?? '').replace(/^["'“”]+|["'“”.]+$/g, '').replace(/\s+/g, ' ').trim()
  if (VACIO.has(t.toLowerCase())) return null
  return t || null
}

function normalizarClaveMuestra(clave: string): 'entrega' | 'direccion' | 'localidad' | 'provincia' | 'cp' | 'cuit' {
  const c = clave.toLowerCase().replace(/ó/g, 'o')
  if (c === 'entrega') return 'entrega'
  if (c === 'direccion') return 'direccion'
  if (c === 'localidad') return 'localidad'
  if (c === 'provincia') return 'provincia'
  if (c === 'cp' || c === 'codigo postal') return 'cp'
  return 'cuit'
}

/**
 * Saca de la respuesta del modelo el bloque [MUESTRA] (y sus líneas), los
 * marcadores [PEDIDO] / [HANDOFF] y el bloque [RESUMEN]. Lo visible es lo
 * que se manda a la persona.
 */
export function extraerSenalesPostPropuesta(respuesta: string): SenalesPostPropuesta {
  let texto = respuesta
  let muestra: DatosMuestraBot | null = null
  let muestraMarcada = false

  const idx = texto.indexOf(MUESTRA_MARKER)
  if (idx >= 0) {
    muestraMarcada = true
    const despues = texto.slice(idx + MUESTRA_MARKER.length)
    const lineas = despues.split('\n')
    const campos: Record<string, string> = {}
    let consumidas = 0
    for (const linea of lineas) {
      const m = /^\s*[-*•]?\s*(entrega|direcci[oó]n|localidad|provincia|cp|c[oó]digo postal|cuit|cuit\/dni|dni)\s*:\s*(.*)$/i.exec(linea)
      if (!m) {
        if (linea.trim() === '' && consumidas === 0) {
          consumidas++
          continue
        }
        break
      }
      campos[normalizarClaveMuestra(m[1]!)] = m[2]!
      consumidas++
    }
    const resto = lineas.slice(consumidas).join('\n')
    texto = texto.slice(0, idx) + resto

    const entregaTexto = (campos['entrega'] ?? '').toLowerCase()
    const entrega: MetodoEntregaMuestra | null = /expreso|env[ií]|mand|correo|cargo/.test(entregaTexto)
      ? 'expreso'
      : /retir|f[aá]brica|busca|pasa/.test(entregaTexto)
        ? 'retiro_fabrica'
        : null
    if (entrega) {
      muestra = {
        entrega,
        direccion: limpiar(campos['direccion']),
        localidad: limpiar(campos['localidad']),
        provincia: limpiar(campos['provincia']),
        codigoPostal: limpiar(campos['cp']),
        cuit: limpiar(campos['cuit']),
      }
    }
  }

  const pedido = texto.includes(PEDIDO_MARKER)
  texto = texto.split(PEDIDO_MARKER).join('')

  const { visible, resumen, handoff } = separarResumen(texto)
  return {
    visible: visible.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(),
    muestra,
    muestraMarcada,
    pedido,
    handoff,
    resumen,
  }
}

/** Qué falta para poder cargar la muestra; [] si está completa. */
export function faltantesMuestra(m: DatosMuestraBot, ficha: DatosEntregaLead = {}): string[] {
  if (m.entrega === 'retiro_fabrica') return []
  const faltan: string[] = []
  if (!m.direccion && !ficha.direccion?.trim()) faltan.push('dirección')
  if (!m.localidad && !ficha.localidad?.trim()) faltan.push('localidad')
  if (!m.provincia && !ficha.provincia?.trim()) faltan.push('provincia')
  if (!m.codigoPostal && !ficha.codigoPostal?.trim()) faltan.push('código postal')
  if (!m.cuit && !ficha.cuit?.trim()) faltan.push('CUIT o DNI')
  return faltan
}

/** Campos de la ficha del lead a actualizar con lo que dijo la persona (solo lo que vino). */
export function camposFichaDesdeMuestra(m: DatosMuestraBot): Partial<Record<keyof DatosEntregaLead, string>> {
  const out: Partial<Record<keyof DatosEntregaLead, string>> = {}
  if (m.direccion) out.direccion = m.direccion
  if (m.localidad) out.localidad = m.localidad
  if (m.provincia) out.provincia = m.provincia
  if (m.codigoPostal) out.codigoPostal = m.codigoPostal
  if (m.cuit) out.cuit = m.cuit
  return out
}

/** Nota interna al cargar la muestra desde el bot. */
export function armarNotaMuestraCargada(m: DatosMuestraBot, ficha: DatosEntregaLead): string {
  if (m.entrega === 'retiro_fabrica') {
    return 'Muestra cargada por el bot: la retira en fábrica. El pedido de muestra quedó confirmado para fábrica.'
  }
  const dir = [
    m.direccion ?? ficha.direccion,
    m.localidad ?? ficha.localidad,
    m.provincia ?? ficha.provincia,
    (m.codigoPostal ?? ficha.codigoPostal) ? `CP ${m.codigoPostal ?? ficha.codigoPostal}` : null,
  ]
    .filter(Boolean)
    .join(', ')
  const cuit = m.cuit ?? ficha.cuit
  return (
    `Muestra cargada por el bot: va por expreso ${EXPRESO_MUESTRA} a ${dir}` +
    (cuit ? `, CUIT/DNI ${cuit}` : '') +
    '. Los datos quedaron en la ficha. El pedido de muestra quedó confirmado para fábrica.'
  )
}
