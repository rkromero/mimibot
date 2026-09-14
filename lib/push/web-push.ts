// Envío de Web Push con claves VAPID (variables VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY y opcional VAPID_SUBJECT). Sin claves el push queda
// desactivado y se loguea una sola vez.

import webpush from 'web-push'
import { db } from '@/db'
import { pushSubscriptions } from '@/db/schema'
import { inArray } from 'drizzle-orm'
import type { PayloadPush } from './aviso'

let configurado: boolean | null = null

export function vapidPublicKey(): string | null {
  return process.env['VAPID_PUBLIC_KEY'] ?? null
}

function configurarVapid(): boolean {
  if (configurado !== null) return configurado
  const pub = process.env['VAPID_PUBLIC_KEY']
  const priv = process.env['VAPID_PRIVATE_KEY']
  if (!pub || !priv) {
    console.warn('[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY no configuradas: push desactivado')
    configurado = false
    return false
  }
  const subject =
    process.env['VAPID_SUBJECT'] ??
    process.env['NEXTAUTH_URL'] ??
    process.env['AUTH_URL'] ??
    'https://alipro.app'
  webpush.setVapidDetails(subject, pub, priv)
  configurado = true
  return true
}

/**
 * Manda el payload a todos los dispositivos de los usuarios indicados.
 * Las suscripciones vencidas (404/410) se borran solas.
 */
export async function enviarPushAUsuarios(userIds: string[], payload: PayloadPush): Promise<void> {
  if (userIds.length === 0 || !configurarVapid()) return

  const subs = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds))

  if (subs.length === 0) return

  const body = JSON.stringify(payload)
  const vencidas: string[] = []

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
        { TTL: 60 * 60, urgency: 'high', topic: payload.tag.slice(0, 32) },
      )
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        vencidas.push(s.id)
      } else {
        console.error('[push] error enviando notificación:', status ?? err)
      }
    }
  }))

  if (vencidas.length > 0) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, vencidas))
  }
}
