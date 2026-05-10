'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#fafafa' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', textAlign: 'center', padding: '2rem' }}>
          <div>
            <p style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Error al cargar la aplicación</p>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '1rem' }}>
              {error.digest ? `Código: ${error.digest}` : 'Por favor intentá recargar la página'}
            </p>
            <button
              onClick={reset}
              style={{ padding: '0.375rem 0.75rem', fontSize: '0.875rem', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}
            >
              Recargar
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
