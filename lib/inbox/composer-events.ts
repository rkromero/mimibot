/**
 * Puente entre las "respuestas rápidas" del inbox y el cuadro de texto del
 * chat (ChatComposer).
 *
 * El composer vive varios niveles abajo (InboxView → LeadPanel → ChatComposer,
 * en tres puntos de render distintos), así que en vez de pasar props por toda
 * la cadena se usa un evento del DOM con el id de la conversación: sólo el
 * composer de esa conversación lo toma.
 *
 * Hay dos eventos: "insertar" deja el texto en el cuadro para retocarlo y
 * mandarlo con Enter; "enviar" lo manda directo por WhatsApp.
 */

export const EVENTO_INSERTAR_TEXTO = 'alipro:chat-insertar-texto'
export const EVENTO_ENVIAR_TEXTO = 'alipro:chat-enviar-texto'

export type TextoConversacionDetail = {
  conversationId: string
  text: string
}

/** @deprecated alias histórico de TextoConversacionDetail */
export type InsertarTextoDetail = TextoConversacionDetail

function emitir(evento: string, detail: TextoConversacionDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<TextoConversacionDetail>(evento, { detail }))
}

function suscribir(
  evento: string,
  conversationId: string,
  handler: (text: string) => void,
): () => void {
  if (typeof window === 'undefined') return () => {}
  const listener = (ev: Event) => {
    const detail = (ev as CustomEvent<TextoConversacionDetail>).detail
    if (!detail || detail.conversationId !== conversationId) return
    handler(detail.text)
  }
  window.addEventListener(evento, listener)
  return () => window.removeEventListener(evento, listener)
}

export function emitirInsertarTexto(detail: TextoConversacionDetail): void {
  emitir(EVENTO_INSERTAR_TEXTO, detail)
}

/**
 * Suscribe un handler a las inserciones de texto de `conversationId`.
 * Devuelve la función para desuscribirse (para el cleanup del useEffect).
 */
export function suscribirInsertarTexto(
  conversationId: string,
  handler: (text: string) => void,
): () => void {
  return suscribir(EVENTO_INSERTAR_TEXTO, conversationId, handler)
}

export function emitirEnviarTexto(detail: TextoConversacionDetail): void {
  emitir(EVENTO_ENVIAR_TEXTO, detail)
}

/** Igual que suscribirInsertarTexto, para el envío directo. */
export function suscribirEnviarTexto(
  conversationId: string,
  handler: (text: string) => void,
): () => void {
  return suscribir(EVENTO_ENVIAR_TEXTO, conversationId, handler)
}

/**
 * Cómo se suma la respuesta rápida a lo que ya había escrito: si el cuadro
 * está vacío la reemplaza; si no, la agrega en una línea nueva.
 */
export function combinarTexto(actual: string, nuevo: string): string {
  const base = actual.trimEnd()
  if (!base) return nuevo
  return `${base}\n${nuevo}`
}
