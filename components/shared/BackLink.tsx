'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ReactNode, MouseEvent } from 'react'

type Props = {
  /** Adónde ir si no hay historial (link directo, notificación, pestaña nueva). */
  fallbackHref: string
  className?: string
  title?: string
  children: ReactNode
}

/**
 * Flecha de "volver" de las fichas. Si se llegó navegando dentro de la app,
 * vuelve por el historial: el listado reaparece con el orden, la página, los
 * filtros y el scroll que tenía. Si no hay adónde volver, va al fallback.
 */
export default function BackLink({ fallbackHref, className, title, children }: Props) {
  const router = useRouter()

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    // Ctrl/Cmd+click, botón del medio: dejar que el navegador abra el link
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    if (window.history.length <= 1) return
    e.preventDefault()
    router.back()
  }

  return (
    <Link href={fallbackHref} onClick={handleClick} className={className} title={title}>
      {children}
    </Link>
  )
}
