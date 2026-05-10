'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    console.error('[app error]', error.digest ?? error.message)
  }, [error])

  return (
    <div className="flex items-center justify-center h-full min-h-[60vh] text-center p-8">
      <div className="max-w-sm">
        <p className="text-sm font-medium text-foreground mb-1">Ocurrió un error inesperado</p>
        <p className="text-xs text-muted-foreground mb-4">
          {error.digest ? `Código: ${error.digest}` : 'Intentá recargar la página'}
        </p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={reset}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Reintentar
          </button>
          <button
            onClick={() => router.push('/pipeline')}
            className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-accent transition-colors"
          >
            Ir al inicio
          </button>
        </div>
      </div>
    </div>
  )
}
