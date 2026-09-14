'use client'

import { useEffect } from 'react'

// Un solo EventSource por pestaña, compartido entre todos los que escuchan
// (burbuja del menú, campanita, tarjetas de mensaje nuevo). Se abre con el
// primer suscriptor y se cierra al irse el último.

type Oyente = (evento: Record<string, unknown>) => void

let stream: EventSource | null = null
const oyentes = new Set<Oyente>()

function abrir() {
  if (stream) return
  stream = new EventSource('/api/realtime/stream')
  stream.onmessage = (e) => {
    let evento: Record<string, unknown>
    try {
      evento = JSON.parse(e.data as string) as Record<string, unknown>
    } catch {
      return
    }
    oyentes.forEach((fn) => fn(evento))
  }
  stream.onerror = () => {}
}

function cerrarSiNadieEscucha() {
  if (oyentes.size === 0 && stream) {
    stream.close()
    stream = null
  }
}

export function suscribirEventosCrm(fn: Oyente): () => void {
  oyentes.add(fn)
  abrir()
  return () => {
    oyentes.delete(fn)
    cerrarSiNadieEscucha()
  }
}

/** Ejecuta `onEvento` con cada evento del stream SSE mientras `enabled`. */
export function useCrmEvents(enabled: boolean, onEvento: Oyente): void {
  useEffect(() => {
    if (!enabled) return
    return suscribirEventosCrm(onEvento)
  }, [enabled, onEvento])
}
