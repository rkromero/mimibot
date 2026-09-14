'use client'

import { useCallback, useEffect, useState } from 'react'

export type EstadoPush =
  | 'cargando'
  | 'no-soportado'
  /** iPhone/iPad sin la app agregada a la pantalla de inicio */
  | 'ios-sin-instalar'
  | 'bloqueado'
  | 'inactivo'
  | 'activo'

function base64UrlABytes(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

function esIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

function esStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true
}

function soportaPush(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

async function registrarEnServidor(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON()
  await fetch('/api/push/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent }),
  })
}

/**
 * Estado y acciones de las notificaciones push en ESTE dispositivo.
 * Si ya estaba suscripto, refresca la suscripción en el servidor al cargar
 * (por si cambió el usuario o venció la fila).
 */
export function usePush() {
  const [estado, setEstado] = useState<EstadoPush>('cargando')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      if (!soportaPush()) {
        setEstado(esIos() && !esStandalone() ? 'ios-sin-instalar' : 'no-soportado')
        return
      }
      if (Notification.permission === 'denied') {
        setEstado('bloqueado')
        return
      }
      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (cancelado) return
        if (sub && Notification.permission === 'granted') {
          setEstado('activo')
          void registrarEnServidor(sub).catch(() => {})
        } else {
          setEstado('inactivo')
        }
      } catch {
        if (!cancelado) setEstado('inactivo')
      }
    })()
    return () => {
      cancelado = true
    }
  }, [])

  const activar = useCallback(async () => {
    setOcupado(true)
    setError(null)
    try {
      const permiso = await Notification.requestPermission()
      if (permiso !== 'granted') {
        setEstado(permiso === 'denied' ? 'bloqueado' : 'inactivo')
        return
      }
      const res = await fetch('/api/push/subscriptions')
      const { publicKey } = (await res.json()) as { publicKey: string | null }
      if (!publicKey) {
        setError('El servidor no tiene configuradas las notificaciones push.')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlABytes(publicKey) as BufferSource,
        }))
      await registrarEnServidor(sub)
      setEstado('activo')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo activar')
    } finally {
      setOcupado(false)
    }
  }, [])

  const desactivar = useCallback(async () => {
    setOcupado(true)
    setError(null)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscriptions', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setEstado('inactivo')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo desactivar')
    } finally {
      setOcupado(false)
    }
  }, [])

  return { estado, ocupado, error, activar, desactivar }
}
