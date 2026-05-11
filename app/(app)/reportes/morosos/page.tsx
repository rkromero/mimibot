'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

type Moroso = {
  id: string
  fecha: string
  diasVencido: number
  saldoPendiente: string
  estadoPago: string
  clienteId: string
  clienteNombre: string
  clienteTelefono: string | null
  clienteCuit: string | null
  vendedorId: string
  vendedorNombre: string | null
}

type ApiResponse = {
  data: Moroso[]
  morosoDias: number
}

function formatMoney(value: string | number) {
  return `$${parseFloat(String(value)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

export default function MorososPage() {
  const [isExporting, setIsExporting] = useState(false)

  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['morosos'],
    queryFn: async () => {
      const res = await fetch('/api/reportes/morosos')
      if (!res.ok) throw new Error('Error al cargar morosos')
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 60_000,
  })

  const morosos = data?.data ?? []
  const morosoDias = data?.morosoDias ?? 30

  async function handleExport() {
    setIsExporting(true)
    try {
      const res = await fetch('/api/export/morosos')
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `morosos_${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setIsExporting(false)
    }
  }

  function openWhatsApp(telefono: string, nombre: string, saldo: string) {
    const phone = telefono.replace(/\D/g, '')
    const text = encodeURIComponent(
      `Hola ${nombre}, te contactamos de Mimi Alfajores para recordarte que tenés un saldo pendiente de ${formatMoney(saldo)}. ¿Cuándo podemos coordinar el pago? Muchas gracias.`
    )
    window.open(`https://wa.me/54${phone}?text=${text}`, '_blank')
  }

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Morosos</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Pedidos con deuda mayor a {morosoDias} días
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={isExporting || morosos.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            aria-label="Exportar CSV"
          >
            <Download size={13} />
            CSV
          </button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Cargando...</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-destructive">Error al cargar los datos</div>
        ) : morosos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
              <span className="text-xl">&#10003;</span>
            </div>
            <h3 className="text-sm font-medium text-foreground mb-1">Sin morosos</h3>
            <p className="text-sm text-muted-foreground">No hay clientes con deuda vencida mayor a {morosoDias} días.</p>
          </div>
        ) : (
          <>
            <div className="mb-3 text-sm text-muted-foreground">
              <span className="font-medium text-destructive">{morosos.length}</span> cliente{morosos.length !== 1 ? 's' : ''} con deuda vencida —{' '}
              Total: <span className="font-medium text-foreground">
                {formatMoney(morosos.reduce((sum, m) => sum + parseFloat(m.saldoPendiente ?? '0'), 0))}
              </span>
            </div>

            <div className="md:hidden space-y-2">
              {morosos.map((m) => (
                <div key={m.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-semibold text-foreground">{m.clienteNombre}</p>
                      {m.clienteCuit && <p className="text-xs text-muted-foreground">CUIT: {m.clienteCuit}</p>}
                    </div>
                    <p className="text-lg font-bold text-destructive shrink-0">
                      {formatMoney(m.saldoPendiente)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      <span className="text-destructive font-medium">{m.diasVencido} días</span> vencido · {m.vendedorNombre ?? '—'}
                    </div>
                    {m.clienteTelefono && (
                      <button
                        onClick={() => openWhatsApp(m.clienteTelefono!, m.clienteNombre, m.saldoPendiente)}
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition-colors"
                        aria-label="Abrir WhatsApp"
                      >
                        <MessageCircle size={12} />
                        WA
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Cliente</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Teléfono</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Vendedor</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Fecha pedido</th>
                    <th className="text-center py-2 px-3 text-muted-foreground font-medium border-b border-border">Días vencido</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium border-b border-border">Deuda</th>
                    <th className="py-2 px-3 border-b border-border" />
                  </tr>
                </thead>
                <tbody>
                  {morosos.map((m) => (
                    <tr key={m.id} className="border-b border-border last:border-0 hover:bg-accent/50 transition-colors">
                      <td className="py-2.5 px-3 font-medium text-foreground">
                        {m.clienteNombre}
                        {m.clienteCuit && <span className="block text-xs text-muted-foreground font-normal">{m.clienteCuit}</span>}
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">{m.clienteTelefono ?? '—'}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">{m.vendedorNombre ?? '—'}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">
                        {m.fecha ? format(new Date(m.fecha), 'dd/MM/yyyy') : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={cn(
                          'px-2 py-0.5 rounded-full text-xs font-medium',
                          m.diasVencido > 90
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                            : m.diasVencido > 60
                              ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                              : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
                        )}>
                          {m.diasVencido}d
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-destructive">
                        {formatMoney(m.saldoPendiente)}
                      </td>
                      <td className="py-2.5 px-3">
                        {m.clienteTelefono && (
                          <button
                            onClick={() => openWhatsApp(m.clienteTelefono!, m.clienteNombre, m.saldoPendiente)}
                            className="flex items-center gap-1 px-2 py-1 rounded-md bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition-colors"
                            title="Enviar WhatsApp"
                            aria-label="Enviar WhatsApp a este cliente"
                          >
                            <MessageCircle size={12} />
                            WA
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
