/**
 * Armado del aviso de "mensaje nuevo" (push en el celular, tarjeta en
 * escritorio, campanita). Funciones puras, sin DB, para poder testearlas.
 */

export type RolUsuario =
  | 'admin' | 'gerente' | 'agent' | 'vendedor' | 'fabrica' | 'repartidor' | 'rtv' | 'distribucion'

export type UsuarioAvisable = { id: string; role: RolUsuario }

const PREVIEW_MAX = 120

const PREVIEW_POR_TIPO: Record<string, string> = {
  image: '📷 Foto',
  audio: '🎤 Nota de voz',
  video: '🎬 Video',
  document: '📄 Documento',
  sticker: '🙂 Sticker',
  location: '📍 Ubicación',
  contacts: '👤 Contacto',
}

/** Texto corto del mensaje para mostrar en la notificación. */
export function previewMensaje(contentType: string, body: string | null | undefined): string {
  const texto = (body ?? '').replace(/\s+/g, ' ').trim()
  if (contentType === 'text' && texto) {
    return texto.length > PREVIEW_MAX ? `${texto.slice(0, PREVIEW_MAX - 1)}…` : texto
  }
  return PREVIEW_POR_TIPO[contentType] ?? 'Mensaje nuevo'
}

/**
 * A quién se le avisa un mensaje entrante. Misma regla que el stream SSE:
 * admins reciben todo, el asignado recibe lo suyo. Si la conversación no
 * tiene dueño, también avisa a los gerentes para que alguien la tome.
 */
const ROLES_CON_INBOX = new Set<RolUsuario>(['admin', 'gerente', 'agent', 'vendedor', 'rtv'])

export function destinatariosAviso(usuarios: UsuarioAvisable[], assignedTo: string | null): string[] {
  const ids = new Set<string>()
  for (const u of usuarios) {
    if (!ROLES_CON_INBOX.has(u.role)) continue
    if (u.role === 'admin') ids.add(u.id)
    else if (assignedTo && u.id === assignedTo) ids.add(u.id)
    else if (!assignedTo && u.role === 'gerente') ids.add(u.id)
  }
  return [...ids]
}

/** Etiqueta de agrupación: una notificación por conversación. */
export function tagConversacion(conversationId: string): string {
  return `conv-${conversationId}`
}

/** URL a la que lleva la notificación. */
export function urlConversacion(conversationId: string): string {
  return `/inbox?conversation=${conversationId}`
}

export type PayloadPush = {
  title: string
  body: string
  tag: string
  url: string
  conversationId: string
}

export function armarPayloadPush(p: { conversationId: string; contactName: string; preview: string }): PayloadPush {
  return {
    title: p.contactName || 'Mensaje nuevo',
    body: p.preview,
    tag: tagConversacion(p.conversationId),
    url: urlConversacion(p.conversationId),
    conversationId: p.conversationId,
  }
}
