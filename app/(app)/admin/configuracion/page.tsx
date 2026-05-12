import BusinessConfigForm from '@/components/admin/BusinessConfigForm'

export const metadata = { title: 'Configuración del Negocio' }

export default function ConfiguracionPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Configuración del Negocio</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Parámetros que definen cómo se clasifican clientes y se calculan metas. Los cambios aplican a cálculos futuros.
          </p>
        </div>
        <BusinessConfigForm />
      </div>
    </div>
  )
}
