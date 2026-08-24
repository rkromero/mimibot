import { FlaskConical } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Pastilla "Muestra" para pedidos con tipo = 'muestra' (muestra CDA cargada
 * desde el lead). Devuelve null para pedidos de venta, así se puede usar en
 * cualquier lista sin condicionales.
 */
export default function MuestraBadge({ tipo, className }: { tipo?: string | null; className?: string }) {
  if (tipo !== 'muestra') return null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
        'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
        className,
      )}
      title="Muestra CDA cargada desde el lead"
    >
      <FlaskConical size={11} />
      Muestra
    </span>
  )
}
