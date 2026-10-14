'use client'

import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/**
 * Estado de un filtro guardado en la query string de la URL (como el orden y
 * la página de DataTable). Así el filtro sobrevive a entrar a una ficha y
 * volver, a recargar, y se puede compartir el link.
 *
 * Vacío o igual al default → se saca de la URL. Usa `replace` para no llenar
 * el historial con cada cambio de filtro.
 */
export function useUrlParam(
  key: string,
  defaultValue = '',
): [string, (value: string) => void] {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const value = searchParams.get(key) ?? defaultValue

  const setValue = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (next === '' || next === defaultValue) params.delete(key)
      else params.set(key, next)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams, key, defaultValue],
  )

  return [value, setValue]
}
