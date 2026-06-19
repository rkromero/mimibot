'use client'

import { useQuery } from '@tanstack/react-query'
import { Printer, RefreshCw } from 'lucide-react'
import EmptyState from '@/components/shared/EmptyState'

const PRINT_STYLES = `
@media print {
  * { visibility: hidden !important; }
  #orden-trabajo-print, #orden-trabajo-print * { visibility: visible !important; }
  #orden-trabajo-print { position: absolute; left: 0; top: 0; width: 100%; padding: 24px; }
}
`

type OrdenItem = {
  productoId: string
  sku: string | null
  nombre: string
  descripcion: string | null
  marcaNombre: string | null
  unidadVenta: 'unidad' | 'caja_12' | 'caja_24' | 'display'
  cantidadVenta: number
  unidadesIndividuales: number
}

type OrdenResponse = {
  data: OrdenItem[]
  totalPedidos: number
}

const UNIDAD_LABEL: Record<OrdenItem['unidadVenta'], string> = {
  unidad: 'Unidad',
  caja_12: 'Caja ×12',
  caja_24: 'Caja ×24',
  display: 'Display',
}

export default function OrdenTrabajoView() {
  const { data, isLoading, isError, refetch } = useQuery<OrdenResponse>({
    queryKey: ['fabrica', 'orden-trabajo'],
    queryFn: () => fetch('/api/fabrica/orden-trabajo').then((r) => r.json()),
    staleTime: 60_000,
  })

  const fecha = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  if (isLoading) {
    return (
      <div className="p-4 md:p-6">
        <div className="text-sm text-muted-foreground">Cargando orden de trabajo...</div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState
          title="Error al cargar la orden de trabajo"
          description="No se pudieron obtener los datos."
          action={{ label: 'Reintentar', onClick: () => void refetch() }}
        />
      </div>
    )
  }

  const items = data?.data ?? []
  const totalPedidos = data?.totalPedidos ?? 0

  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />

      <div id="orden-trabajo-print" className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Orden de trabajo</h1>
            <p className="text-sm text-muted-foreground">
              {fecha}
              {' · '}
              {totalPedidos}{' '}
              {totalPedidos === 1 ? 'pedido confirmado' : 'pedidos confirmados'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => void refetch()}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <RefreshCw size={13} />
              Actualizar
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Printer size={14} />
              Imprimir / PDF
            </button>
          </div>
        </div>

        {items.length === 0 ? (
          <EmptyState
            title="Sin productos a producir"
            description="No hay pedidos confirmados en este momento."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 border-b border-border">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Producto
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-32">
                    Marca
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-32">
                    Unidad de venta
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider w-28">
                    Cantidad
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider w-36">
                    Total unidades
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => (
                  <tr key={item.productoId} className="hover:bg-accent/40 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">{item.nombre}</span>
                      {item.descripcion && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {item.descripcion}
                        </span>
                      )}
                      {item.sku && (
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {item.sku}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                        {item.marcaNombre ?? 'Sin marca'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {UNIDAD_LABEL[item.unidadVenta]}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                      {item.cantidadVenta.toLocaleString('es-AR')}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {item.unidadesIndividuales.toLocaleString('es-AR')} un.
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
