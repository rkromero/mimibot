import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-6">
        <span className="text-2xl font-bold text-muted-foreground">404</span>
      </div>
      <h1 className="text-xl font-semibold text-foreground mb-2">Página no encontrada</h1>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm">
        La página que buscás no existe o fue movida.
      </p>
      <Link
        href="/dashboard"
        className="inline-flex items-center px-5 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        Ir al Dashboard
      </Link>
    </div>
  )
}
