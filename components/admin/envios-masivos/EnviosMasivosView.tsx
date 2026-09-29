'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Megaphone, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatFechaHoraAR } from '@/lib/dates'
import type { EnvioResumen } from '@/lib/envios-masivos/detalle'
import NuevoEnvioWizard from './NuevoEnvioWizard'

export const ESTADO_ENVIO: Record<EnvioResumen['estado'], { label: string; clase: string }> = {
  programado: { label: 'Programado', clase: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  enviando: { label: 'Enviando', clase: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  completado: { label: 'Completado', clase: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  cancelado: { label: 'Cancelado', clase: 'bg-muted text-muted-foreground' },
}

/** Operación → Envíos masivos (solo admin): listado de envíos y botón para armar uno nuevo. */
export default function EnviosMasivosView() {
  const [nuevo, setNuevo] = useState(false)
  const { data = [], isLoading, refetch } = useQuery<EnvioResumen[]>({
    queryKey: ['envios-masivos'],
    queryFn: async () => {
      const res = await fetch('/api/admin/envios-masivos')
      if (!res.ok) return []
      const json = await res.json() as { data: EnvioResumen[] }
      return json.data
    },
    refetchInterval: (q) => (q.state.data?.some((e) => e.estado === 'enviando') ? 5_000 : 30_000),
  })

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Envíos masivos</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Una plantilla aprobada a un grupo de leads, ahora o programada. Cada mensaje queda en el chat del lead.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNuevo(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            <Plus size={16} /> Nuevo envío
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>
        ) : data.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-10 text-center">
            <Megaphone size={28} className="mx-auto text-muted-foreground/60" />
            <p className="mt-2 text-sm font-medium">Todavía no hay envíos</p>
            <p className="text-xs text-muted-foreground mt-1">Armá el primero con &quot;Nuevo envío&quot;: elegís el grupo, la plantilla y cuándo sale.</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Envío</th>
                  <th className="text-left font-medium px-4 py-2 hidden md:table-cell">Plantilla</th>
                  <th className="text-left font-medium px-4 py-2">Cuándo</th>
                  <th className="text-right font-medium px-4 py-2">Enviados</th>
                  <th className="text-left font-medium px-4 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.map((e) => (
                  <tr key={e.id} className="border-t border-border hover:bg-accent/40">
                    <td className="px-4 py-2.5">
                      <Link href={`/admin/envios-masivos/${e.id}`} className="font-medium hover:underline">{e.nombre}</Link>
                      <p className="text-[11px] text-muted-foreground">{e.creadoPorNombre ?? ''}</p>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs hidden md:table-cell">{e.templateName}</td>
                    <td className="px-4 py-2.5 text-xs">{formatFechaHoraAR(e.programadoAt)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {e.enviados} / {e.total - e.omitidos}
                      {e.fallidos > 0 && <span className="ml-1 text-[11px] text-destructive">{e.fallidos} fallidos</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium', ESTADO_ENVIO[e.estado].clase)}>{ESTADO_ENVIO[e.estado].label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {nuevo && (
        <NuevoEnvioWizard
          onClose={() => setNuevo(false)}
          onCreado={() => {
            setNuevo(false)
            void refetch()
          }}
        />
      )}
    </div>
  )
}
