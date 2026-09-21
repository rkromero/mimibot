/**
 * sincronizarSuscripcionPush (lib/push/use-push.ts): al arrancar la app, con el
 * permiso ya dado, la suscripción push se mantiene sola.
 *
 *  1. Sin soporte de push → no hace nada.
 *  2. Permiso no concedido → no pide permiso ni toca nada.
 *  3. Hay suscripción → la re-registra en el servidor (refresca last_seen_at / usuario).
 *  4. El navegador la venció (getSubscription = null) → se suscribe de nuevo con la
 *     clave del servidor y la registra: la persona no tiene que tocar "Activar".
 *  5. El servidor no tiene clave → error, sin romper.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sincronizarSuscripcionPush } from '@/lib/push/use-push'

const SUB = {
  endpoint: 'https://push.example/abc',
  toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } }),
}

function armarNavegador(opts: { permiso: NotificationPermission; suscripcion: unknown; publicKey?: string | null }) {
  const subscribe = vi.fn().mockResolvedValue(SUB)
  const getSubscription = vi.fn().mockResolvedValue(opts.suscripcion)
  const fetch = vi.fn(async (url: string, init?: { method?: string }) => {
    if (init?.method === 'POST') return { ok: true, json: async () => ({ ok: true }) }
    return { ok: true, json: async () => ({ publicKey: opts.publicKey === undefined ? 'QUJD' : opts.publicKey }) }
  })
  vi.stubGlobal('window', { PushManager: function () {}, Notification: function () {} })
  vi.stubGlobal('Notification', { permission: opts.permiso })
  vi.stubGlobal('navigator', {
    userAgent: 'test',
    serviceWorker: { ready: Promise.resolve({ pushManager: { getSubscription, subscribe } }) },
  })
  vi.stubGlobal('fetch', fetch)
  vi.stubGlobal('atob', (s: string) => Buffer.from(s, 'base64').toString('binary'))
  return { subscribe, getSubscription, fetch }
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllGlobals())

describe('sincronizarSuscripcionPush', () => {
  it('sin soporte de push no hace nada', async () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', {})
    expect(await sincronizarSuscripcionPush()).toBe('sin-soporte')
  })

  it('sin permiso concedido no pide permiso ni toca nada', async () => {
    const n = armarNavegador({ permiso: 'default', suscripcion: null })
    expect(await sincronizarSuscripcionPush()).toBe('sin-permiso')
    expect(n.subscribe).not.toHaveBeenCalled()
    expect(n.fetch).not.toHaveBeenCalled()
  })

  it('con suscripción vigente la re-registra en el servidor', async () => {
    const n = armarNavegador({ permiso: 'granted', suscripcion: SUB })
    expect(await sincronizarSuscripcionPush()).toBe('refrescada')
    expect(n.subscribe).not.toHaveBeenCalled()
    const post = n.fetch.mock.calls.find((c) => (c[1] as { method?: string } | undefined)?.method === 'POST')
    expect(post?.[0]).toBe('/api/push/subscriptions')
    expect(JSON.parse((post?.[1] as { body: string }).body)).toMatchObject({ endpoint: SUB.endpoint, keys: { p256dh: 'p', auth: 'a' } })
  })

  it('si el navegador la venció, se suscribe de nuevo con la clave del servidor y la registra', async () => {
    const n = armarNavegador({ permiso: 'granted', suscripcion: null })
    expect(await sincronizarSuscripcionPush()).toBe('renovada')
    expect(n.subscribe).toHaveBeenCalledTimes(1)
    expect(n.subscribe.mock.calls[0]![0]).toMatchObject({ userVisibleOnly: true })
    expect(n.fetch.mock.calls.some((c) => (c[1] as { method?: string } | undefined)?.method === 'POST')).toBe(true)
  })

  it('sin clave en el servidor devuelve error sin romper', async () => {
    const n = armarNavegador({ permiso: 'granted', suscripcion: null, publicKey: null })
    expect(await sincronizarSuscripcionPush()).toBe('error')
    expect(n.subscribe).not.toHaveBeenCalled()
  })
})
