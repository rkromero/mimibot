'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { Plus, Download, AlertTriangle, History } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

type StockSaldo = {
  id: string
  sku: string | null
  nombre: string
  categoria: string | null
  unidadVenta: string
  stockMinimo: number
  stockActual: number
  ultimoMovimiento: string | null
  bajoCritico: boolean
}

type Movimiento = {
  id: string
  tipo: string
  cantidad: number
  saldoResultante: number
  referencia: string | null
  notas: string | null
  pedidoId: string | null
  createdAt: string
  registradoPorNombre: string | null
}

const TIPO_LABELS: Record<string, { label: string; color: string }> = {
  entrada:            { label: 'Entrada',    color: 'text-green-700 bg-green-100' },
  salida:             { label: 'Salida',     color: 'text-red-700 bg-red-100' },
  ajuste:             { label: 'Ajuste',     color: 'text-blue-700 bg-blue-100' },
  reserva:            { label: 'Reserva',    color: 'text-amber-700 bg-amber-100' },
  cancelacion_reserva:{ label: 'Canc. res.', color: 'text-gray-700 bg-gray-100' },
}

const UNIDAD_LABELS: Record<string, string> = {
  unidad: 'Unidad',
  caja_12: 'Caja x12',
  caja_24: 'Caja x24',
  display: 'Display',
}

type EntradaForm = {
  productoId: string
  cantidad: string
  notas: string
}

export default function StockPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const queryClient = useQueryClient()
  const [isExporting, setIsExporting] = useState(false)
  const [showEntrada, setShowEntrada] = useState(false)
  const [entradaForm, setEntradaForm] = useState<EntradaForm>({ productoId: '', cantidad: '', notas: '' })
  const [entradaError, setEntradaError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [historialProducto, setHistorialProducto] = useState<StockSaldo | null>(null)

  const { data: movimientos = [], isLoading: loadingMovimientos } = useQuery<Movimiento[]>({
    queryKey: ['stock-movimientos', historialProducto?.id],
    queryFn: async () => {
      if (!historialProducto) return []
      const res = await fetch(`/api/stock/movimientos?productoId=${historialProducto.id}`)
      if (!res.ok) return []
      const json = await res.json() as { data: Movimiento[] }
      return json.data
    },
    enabled: !!historialProducto,
    staleTime: 10_000,
  })

  const { data: saldos = [], isLoading } = useQuery<StockSaldo[]>({
    queryKey: ['stock-saldos'],
    queryFn: async () => {
      const res = await fetch('/api/stock/saldos')
      if (!res.ok) throw new Error('Error al cargar stock')
      const json = await res.json() as { data: StockSaldo[] }
      return json.data
    },
    staleTime: 30_000,
  })

  const bajoMinimo = saldos.filter((s) => s.bajoCritico)

  async function handleExport() {
    setIsExporting(true)
    try {
      const res = await fetch('/api/export/stock')
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `stock_${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setIsExporting(false)
    }
  }

  async function handleEntrada(e: React.FormEvent) {
    e.preventDefault()
    setEntradaError(null)
    const cantidad = parseInt(entradaForm.cantidad, 10)
    if (!entradaForm.productoId) { setEntradaError('Seleccioná un producto'); return }
    if (isNaN(cantidad) || cantidad <= 0) { setEntradaError('La cantidad debe ser mayor a 0'); return }

    setIsSaving(true)
    try {
      const res = await fetch('/api/stock/movimientos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productoId: entradaForm.productoId, tipo: 'entrada', cantidad, notas: entradaForm.notas || null }),
      })
      if (!res.ok) {
        const data = await res.json() as { error: string }
        setEntradaError(data.error ?? 'Error al registrar')
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['stock-saldos'] })
      setShowEntrada(false)
      setEntradaForm({ productoId: '', cantidad: '', notas: '' })
    } catch {
      setEntradaError('Error de conexión')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Stock</h1>
            {bajoMinimo.length > 0 && (
              <p className="text-sm text-destructive mt-0.5 flex items-center gap-1">
                <AlertTriangle size={13} />
                {bajoMinimo.length} producto{bajoMinimo.length !== 1 ? 's' : ''} bajo mínimo
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              aria-label="Exportar CSV"
            >
              <Download size={13} />
              CSV
            </button>
            {isAdmin && (
              <button
                onClick={() => setShowEntrada(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Plus size={14} />
                Entrada
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Cargando...</div>
        ) : saldos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <span className="text-xl">&#128230;</span>
            </div>
            <h3 className="text-sm font-medium text-foreground mb-1">Sin stock registrado</h3>
            <p className="text-sm text-muted-foreground">Registrá la primera entrada de stock para comenzar.</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">SKU</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border">Producto</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border hidden md:table-cell">Unidad</th>
                  <th className="text-center py-2 px-3 text-muted-foreground font-medium border-b border-border">Stock actual</th>
                  <th className="text-center py-2 px-3 text-muted-foreground font-medium border-b border-border">Mínimo</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium border-b border-border hidden lg:table-cell">Último mov.</th>
                  <th className="py-2 px-3 border-b border-border" />
                </tr>
              </thead>
              <tbody>
                {saldos.map((s) => (
                  <tr key={s.id} className={cn(
                    'border-b border-border last:border-0 transition-colors',
                    s.bajoCritico ? 'bg-red-50/50 dark:bg-red-950/10 hover:bg-red-50 dark:hover:bg-red-950/20' : 'hover:bg-accent/50',
                  )}>
                    <td className="py-2.5 px-3 text-muted-foreground font-mono text-xs">
                      {s.sku ?? '—'}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-foreground">
                      {s.nombre}
                      {s.categoria && <span className="block text-xs text-muted-foreground font-normal">{s.categoria}</span>}
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground hidden md:table-cell">
                      {UNIDAD_LABELS[s.unidadVenta] ?? s.unidadVenta}
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold">
                      <span className={cn(
                        s.bajoCritico ? 'text-destructive' : 'text-foreground',
                      )}>
                        {s.stockActual}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center text-muted-foreground">{s.stockMinimo}</td>
                    <td className="py-2.5 px-3 text-muted-foreground hidden lg:table-cell text-xs">
                      {s.ultimoMovimiento ? format(new Date(s.ultimoMovimiento), 'dd/MM/yyyy HH:mm') : 'Sin movimientos'}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        {s.bajoCritico && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                            BAJO
                          </span>
                        )}
                        <button
                          onClick={() => setHistorialProducto(s)}
                          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                          title="Ver historial"
                          aria-label="Ver historial de movimientos"
                        >
                          <History size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {historialProducto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <button className="absolute inset-0" onClick={() => setHistorialProducto(null)} aria-label="Cerrar" />
          <div className="relative bg-card border border-border rounded-lg p-5 w-full max-w-2xl shadow-xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Historial — {historialProducto.sku ? `[${historialProducto.sku}] ` : ''}{historialProducto.nombre}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">Stock actual: <strong>{historialProducto.stockActual}</strong></p>
              </div>
              <button onClick={() => setHistorialProducto(null)} className="text-muted-foreground hover:text-foreground text-lg leading-none">&times;</button>
            </div>
            <div className="overflow-y-auto flex-1">
              {loadingMovimientos ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Cargando...</div>
              ) : movimientos.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Sin movimientos registrados.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border">
                      <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">Fecha</th>
                      <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">Tipo</th>
                      <th className="text-right py-1.5 px-2 text-muted-foreground font-medium">Cantidad</th>
                      <th className="text-right py-1.5 px-2 text-muted-foreground font-medium">Saldo</th>
                      <th className="text-left py-1.5 px-2 text-muted-foreground font-medium hidden sm:table-cell">Referencia</th>
                      <th className="text-left py-1.5 px-2 text-muted-foreground font-medium hidden md:table-cell">Por</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.map((m) => {
                      const tipoInfo = TIPO_LABELS[m.tipo] ?? { label: m.tipo, color: 'text-foreground bg-muted' }
                      const isNegative = ['salida', 'reserva'].includes(m.tipo)
                      return (
                        <tr key={m.id} className="border-b border-border last:border-0 hover:bg-accent/30">
                          <td className="py-1.5 px-2 text-muted-foreground whitespace-nowrap">
                            {format(new Date(m.createdAt), 'dd/MM/yy HH:mm')}
                          </td>
                          <td className="py-1.5 px-2">
                            <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', tipoInfo.color)}>
                              {tipoInfo.label}
                            </span>
                          </td>
                          <td className={cn('py-1.5 px-2 text-right font-mono tabular-nums', isNegative ? 'text-red-600' : 'text-green-600')}>
                            {isNegative ? '-' : '+'}{m.cantidad}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono tabular-nums font-medium text-foreground">
                            {m.saldoResultante}
                          </td>
                          <td className="py-1.5 px-2 text-muted-foreground hidden sm:table-cell truncate max-w-[140px]">
                            {m.referencia ?? m.notas ?? '—'}
                          </td>
                          <td className="py-1.5 px-2 text-muted-foreground hidden md:table-cell">
                            {m.registradoPorNombre ?? '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {showEntrada && isAdmin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <button className="absolute inset-0" onClick={() => setShowEntrada(false)} aria-label="Cerrar" />
          <div className="relative bg-card border border-border rounded-lg p-5 w-full max-w-md shadow-xl">
            <h2 className="text-sm font-semibold text-foreground mb-4">Registrar entrada de stock</h2>
            <form onSubmit={handleEntrada} className="space-y-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Producto *</label>
                <select
                  value={entradaForm.productoId}
                  onChange={(e) => setEntradaForm((f) => ({ ...f, productoId: e.target.value }))}
                  className="w-full px-3 py-2.5 md:py-1.5 text-[16px] md:text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  required
                >
                  <option value="">Seleccionar producto...</option>
                  {saldos.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.sku ? `[${s.sku}] ` : ''}{s.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Cantidad *</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={entradaForm.cantidad}
                  onChange={(e) => setEntradaForm((f) => ({ ...f, cantidad: e.target.value }))}
                  placeholder="0"
                  className="w-full px-3 py-2.5 md:py-1.5 text-[16px] md:text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Notas</label>
                <input
                  type="text"
                  value={entradaForm.notas}
                  onChange={(e) => setEntradaForm((f) => ({ ...f, notas: e.target.value }))}
                  placeholder="Ref. remito, lote, etc."
                  className="w-full px-3 py-2.5 md:py-1.5 text-[16px] md:text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              {entradaError && <p className="text-xs text-destructive">{entradaError}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {isSaving ? 'Guardando...' : 'Registrar entrada'}
                </button>
                <button type="button" onClick={() => setShowEntrada(false)} className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
