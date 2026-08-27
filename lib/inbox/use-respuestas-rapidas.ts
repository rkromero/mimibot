import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ordenarRespuestas, type RespuestaRapida } from '@/lib/inbox/respuestas-rapidas'
import type { RespuestaRapidaInput } from '@/lib/validations/respuesta-rapida'

export const RESPUESTAS_RAPIDAS_KEY = ['respuestas-rapidas'] as const

async function leerError(res: Response, fallback: string): Promise<string> {
  try {
    const json = (await res.json()) as { error?: string }
    return json.error ?? fallback
  } catch {
    return fallback
  }
}

/** Lista compartida de respuestas rápidas (cacheada 5 min, se invalida al editar). */
export function useRespuestasRapidas() {
  return useQuery<RespuestaRapida[]>({
    queryKey: RESPUESTAS_RAPIDAS_KEY,
    queryFn: async () => {
      const res = await fetch('/api/respuestas-rapidas')
      if (!res.ok) throw new Error(await leerError(res, 'No se pudieron cargar las respuestas rápidas'))
      const json = (await res.json()) as { data: RespuestaRapida[] }
      return ordenarRespuestas(json.data)
    },
    staleTime: 5 * 60_000,
  })
}

/** Crea (sin id) o edita (con id) una respuesta rápida y refresca la lista. */
export function useGuardarRespuestaRapida() {
  const queryClient = useQueryClient()
  return useMutation<RespuestaRapida, Error, RespuestaRapidaInput & { id?: string }>({
    mutationFn: async ({ id, ...input }) => {
      const res = await fetch(id ? `/api/respuestas-rapidas/${id}` : '/api/respuestas-rapidas', {
        method: id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error(await leerError(res, 'No se pudo guardar la respuesta rápida'))
      const json = (await res.json()) as { data: RespuestaRapida }
      return json.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: RESPUESTAS_RAPIDAS_KEY })
    },
  })
}

export function useEliminarRespuestaRapida() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/respuestas-rapidas/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await leerError(res, 'No se pudo eliminar la respuesta rápida'))
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: RESPUESTAS_RAPIDAS_KEY })
    },
  })
}

const PANEL_KEY = 'alipro:chat-respuestas-rapidas'

/**
 * Panel de respuestas rápidas al lado del chat: abierto/cerrado. La
 * preferencia se guarda por navegador; sin preferencia, arranca abierto solo
 * en pantallas anchas (≥1280px) para no achicar el chat. Se lee en un effect
 * para no romper la hidratación (en el server no hay localStorage).
 */
export function usePanelRespuestasRapidas(): [boolean, () => void] {
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(PANEL_KEY)
      setAbierto(guardado !== null ? guardado === '1' : window.innerWidth >= 1280)
    } catch {
      setAbierto(false)
    }
  }, [])

  const toggle = useCallback(() => {
    setAbierto((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(PANEL_KEY, next ? '1' : '0')
      } catch {
        // sin localStorage (modo privado, etc.): solo dura la sesión
      }
      return next
    })
  }, [])

  return [abierto, toggle]
}
