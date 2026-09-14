// Qué conversación tiene abierta el usuario en este navegador. Lo publica el
// InboxView y lo consulta el proveedor de notificaciones para no avisar lo
// que ya está viendo. También le avisa al service worker para que cierre las
// notificaciones del sistema de esa conversación.

let activa: string | null = null
const oyentes = new Set<(id: string | null) => void>()

export function conversacionActiva(): string | null {
  return activa
}

export function setConversacionActiva(id: string | null): void {
  if (activa === id) return
  activa = id
  oyentes.forEach((fn) => fn(id))
  if (id && typeof navigator !== 'undefined') {
    navigator.serviceWorker?.controller?.postMessage({ type: 'CONVERSACION_ABIERTA', conversationId: id })
  }
}

export function suscribirConversacionActiva(fn: (id: string | null) => void): () => void {
  oyentes.add(fn)
  return () => {
    oyentes.delete(fn)
  }
}

const EVENTO_ABRIR = 'alipro:abrir-conversacion'

/**
 * Navega a una conversación del inbox desde una notificación. Si el inbox ya
 * está montado, además le avisa por evento: la URL puede no cambiar (misma
 * conversación que la de la URL, pero el usuario había elegido otra).
 */
export function abrirConversacion(router: { push: (url: string) => void }, conversationId: string): void {
  router.push(`/inbox?conversation=${conversationId}`)
  window.dispatchEvent(new CustomEvent(EVENTO_ABRIR, { detail: { conversationId } }))
}

export function escucharAbrirConversacion(fn: (conversationId: string) => void): () => void {
  const handler = (e: Event) => {
    const id = (e as CustomEvent<{ conversationId?: string }>).detail?.conversationId
    if (id) fn(id)
  }
  window.addEventListener(EVENTO_ABRIR, handler)
  return () => window.removeEventListener(EVENTO_ABRIR, handler)
}

/** ¿El usuario está mirando esta conversación ahora mismo (pestaña visible)? */
export function estaViendoConversacion(id: string): boolean {
  if (activa !== id) return false
  if (typeof document === 'undefined') return true
  return document.visibilityState === 'visible'
}
