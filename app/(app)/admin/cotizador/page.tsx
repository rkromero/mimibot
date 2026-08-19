import InsumosSection from '@/components/admin/cotizador/InsumosSection'
import RecetasSection from '@/components/admin/cotizador/RecetasSection'
import ConfigSection from '@/components/admin/cotizador/ConfigSection'

export const metadata = { title: 'Cotizador' }

export default function CotizadorPage() {
  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-5xl mx-auto space-y-4 md:space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Cotizador</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Insumos, recetas por gramaje y parámetros que alimentan las cotizaciones de propuestas.
          </p>
        </div>
        <InsumosSection />
        <RecetasSection />
        <ConfigSection />
      </div>
    </div>
  )
}
