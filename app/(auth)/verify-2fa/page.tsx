import TotpForm from './TotpForm'

export const dynamic = 'force-dynamic'

export default function Verify2FAPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">Verificación en dos pasos</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Ingresá el código de 6 dígitos de tu app autenticadora
          </p>
        </div>
        <TotpForm />
      </div>
    </div>
  )
}
