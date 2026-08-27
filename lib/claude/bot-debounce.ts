/**
 * Espera del bot antes de responder.
 *
 * Cuando la persona escribe varios mensajes seguidos ("Hola", "quiero cotizar",
 * "alfajores"), el bot no contesta cada uno: cada mensaje reinicia una espera
 * (configurable en Ajustes → Bot) y, cuando pasa sin mensajes nuevos, corre UN
 * solo turno con el historial completo (los mensajes seguidos ya se unen en un
 * único turno de usuario en bot-context).
 *
 * Estado en memoria por lead (timer de espera, corrida en curso, mensajes que
 * llegaron durante la corrida). Como el server puede reiniciarse en medio de
 * la espera, el momento a partir del cual hay que responder se guarda también
 * en `leads.bot_responder_desde`; `retomarTurnosBotPendientes` (scheduler de
 * instrumentation.ts) retoma lo que haya quedado vencido.
 */
import { and, eq, isNull, lte, isNotNull } from 'drizzle-orm'
import { db } from '@/db'
import { leads, botConfig, conversations, contacts } from '@/db/schema'
import { processBotTurn } from './bot'

export const ESPERA_DEFAULT_SEGUNDOS = 15
export const ESPERA_MIN_SEGUNDOS = 0
export const ESPERA_MAX_SEGUNDOS = 120

export type TurnoBotParams = {
  leadId: string
  conversationId: string
  inboundMessageId: string
  contactPhone: string
}

type Estado = {
  /** Espera en curso por lead: se reinicia con cada mensaje nuevo */
  timers: Map<string, NodeJS.Timeout>
  /** Leads con un turno del bot ejecutándose ahora */
  enCurso: Set<string>
  /** Mensajes que llegaron mientras el bot generaba: se reprograma al terminar */
  reprogramar: Map<string, TurnoBotParams>
}

declare global {
  // eslint-disable-next-line no-var
  var __botDebounce: Estado | undefined
}

// En globalThis para sobrevivir al hot reload de dev (mismo patrón que el
// scheduler de seguimientos).
function estado(): Estado {
  if (!globalThis.__botDebounce) {
    globalThis.__botDebounce = { timers: new Map(), enCurso: new Set(), reprogramar: new Map() }
  }
  return globalThis.__botDebounce
}

/** Segundos de espera efectivos: config acotada al rango, o el default. */
export function calcularEsperaSegundos(
  config: { esperaRespuestaSegundos?: number | null } | null | undefined,
): number {
  const valor = config?.esperaRespuestaSegundos
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return ESPERA_DEFAULT_SEGUNDOS
  return Math.min(ESPERA_MAX_SEGUNDOS, Math.max(ESPERA_MIN_SEGUNDOS, Math.round(valor)))
}

/**
 * Llegó un mensaje del contacto: (re)programa la respuesta del bot para dentro
 * de la espera configurada. Si hay un turno corriendo en este momento, se
 * anota para volver a programar cuando termine (así el bot también responde a
 * lo que llegó mientras escribía).
 */
export async function programarTurnoBot(params: TurnoBotParams): Promise<void> {
  const config = await db.query.botConfig.findFirst({ columns: { esperaRespuestaSegundos: true } })
  const esperaMs = calcularEsperaSegundos(config) * 1000
  const responderDesde = new Date(Date.now() + esperaMs)

  // Red de seguridad: si el proceso muere antes de que venza el timer, el
  // scheduler ve la marca vencida y responde igual.
  await db.update(leads).set({ botResponderDesde: responderDesde }).where(eq(leads.id, params.leadId))

  const st = estado()
  if (st.enCurso.has(params.leadId)) {
    st.reprogramar.set(params.leadId, params)
    return
  }

  const previo = st.timers.get(params.leadId)
  if (previo) clearTimeout(previo)

  const timer = setTimeout(() => {
    st.timers.delete(params.leadId)
    void ejecutarTurnoBot(params)
  }, esperaMs)
  st.timers.set(params.leadId, timer)
}

/**
 * Corre el turno del bot para un lead, garantizando una sola corrida a la vez.
 * Al terminar limpia la marca pendiente, salvo que hayan llegado mensajes
 * durante la corrida: en ese caso vuelve a programar (con la espera completa,
 * por si la persona sigue escribiendo).
 */
export async function ejecutarTurnoBot(params: TurnoBotParams): Promise<void> {
  const st = estado()
  if (st.enCurso.has(params.leadId)) {
    st.reprogramar.set(params.leadId, params)
    return
  }
  st.enCurso.add(params.leadId)

  try {
    await processBotTurn(params)
  } catch (err) {
    console.error('[bot] error en el turno diferido:', err)
  } finally {
    st.enCurso.delete(params.leadId)
    const pendiente = st.reprogramar.get(params.leadId)
    st.reprogramar.delete(params.leadId)

    if (pendiente) {
      void programarTurnoBot(pendiente).catch((err) => console.error('[bot] error reprogramando turno:', err))
    } else {
      // Solo se limpia una marca ya vencida: una futura la puso un mensaje
      // que entró recién y todavía tiene su propio timer.
      await db
        .update(leads)
        .set({ botResponderDesde: null })
        .where(and(eq(leads.id, params.leadId), lte(leads.botResponderDesde, new Date())))
        .catch((err) => console.error('[bot] no se pudo limpiar bot_responder_desde:', err))
    }
  }
}

/**
 * Scheduler: responde los leads cuya espera venció y no tienen timer en
 * memoria (típicamente porque el server se reinició en el medio). Devuelve
 * cuántos disparó.
 */
export async function retomarTurnosBotPendientes(): Promise<number> {
  const st = estado()
  const ahora = new Date()

  const vencidos = await db
    .select({
      leadId: leads.id,
      conversationId: conversations.id,
      waContactPhone: conversations.waContactPhone,
      contactPhone: contacts.phone,
    })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .leftJoin(conversations, eq(conversations.leadId, leads.id))
    .where(
      and(
        isNotNull(leads.botResponderDesde),
        lte(leads.botResponderDesde, ahora),
        eq(leads.botEnabled, true),
        eq(leads.botQualified, false),
        isNull(leads.deletedAt),
      ),
    )

  let disparados = 0
  for (const v of vencidos) {
    if (st.timers.has(v.leadId) || st.enCurso.has(v.leadId)) continue

    const telefono = v.waContactPhone ?? v.contactPhone
    if (!v.conversationId || !telefono) {
      // Sin conversación o teléfono no hay a quién responder: limpiar para no
      // reintentar en cada tick.
      await db.update(leads).set({ botResponderDesde: null }).where(eq(leads.id, v.leadId))
      continue
    }

    disparados++
    void ejecutarTurnoBot({
      leadId: v.leadId,
      conversationId: v.conversationId,
      inboundMessageId: '',
      contactPhone: telefono,
    })
  }
  return disparados
}

/** Para tests: descarta timers y estado en memoria. */
export function resetEstadoBotDebounce(): void {
  const st = estado()
  for (const t of st.timers.values()) clearTimeout(t)
  st.timers.clear()
  st.enCurso.clear()
  st.reprogramar.clear()
}
