import { useEffect, useState } from 'react'

/**
 * ¿Viewport de celular? (menos de 768px, el breakpoint `md` de Tailwind).
 * Devuelve null en el primer render (en el server no hay `window`), así el
 * componente puede evitar pintar el layout equivocado por un instante.
 */
export function useEsMobile(): boolean | null {
  const [esMobile, setEsMobile] = useState<boolean | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const actualizar = () => setEsMobile(mq.matches)
    actualizar()
    mq.addEventListener('change', actualizar)
    return () => mq.removeEventListener('change', actualizar)
  }, [])

  return esMobile
}
