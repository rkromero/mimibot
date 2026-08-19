'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Calculator, AlertTriangle, X, Download, MessageCircle, Mail, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatFechaAR, formatFechaInstanteAR } from '@/lib/dates'
import ConfirmDeleteModal from '@/components/shared/ConfirmDeleteModal'
import { useToast } from '@/components/shared/ToastProvider'

type Packaging = 'cristal' | 'personalizado'

type Escenario = {
  cantidad: number
  elegido: boolean
  costoInsumosUnitario: number
  precioUnitNeto: number
  neto: number
  setup: number
  iva: number
  total: number
}

type PreviewData = {
  escenarios: Escenario[]
  requiereAprobacion: boolean
  topeDescuentoPct: number
  validezDias: number
  margenObjetivoPct: number
}

// Rentabilidad interna del vendedor (nunca sale en el PDF ni al cliente)
function margenRealPct(esc: Escenario): number {
  if (esc.precioUnitNeto <= 0) return 0
  return ((esc.precioUnitNeto - esc.costoInsumosUnitario) / esc.precioUnitNeto) * 100
}

// Verde: hasta 10 puntos debajo del margen configurado · Ámbar: más abajo ·
// Rojo: margen real menor al 10%
function margenColorClass(margenReal: number, objetivoPct: number): string {
  if (margenReal < 10) return 'text-red-600 dark:text-red-400'
  if (margenReal < objetivoPct - 10) return 'text-amber-600 dark:text-amber-400'
  return 'text-green-600 dark:text-green-400'
}

type PropuestaResumen = {
  id: string
  numero: number
  fecha: string
  cantidad: number
  gramaje: number
  estado: 'borrador' | 'pendiente_aprobacion' | 'aprobada' | 'enviada' | 'aceptada' | 'rechazada' | 'vencida'
  vigenteHasta: string
  total: number
}

const ESTADO_PROPUESTA_LABEL: Record<PropuestaResumen['estado'], string> = {
  borrador: 'Borrador',
  pendiente_aprobacion: 'P. Aprobación',
  aprobada: 'Aprobada',
  enviada: 'Enviada',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  vencida: 'Vencida',
}

const ESTADO_PROPUESTA_COLOR: Record<PropuestaResumen['estado'], string> = {
  borrador: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  pendiente_aprobacion: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  aprobada: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  enviada: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  aceptada: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  rechazada: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  vencida: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500',
}

const inputClass = cn(
  'w-full px-3 py-2.5 md:py-1.5 text-[16px] md:text-sm rounded-md border',
  'border-border bg-background text-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring transition-colors',
)

function fmt(n: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)
}

// Mismo formato que el PDF (no se importa del template para no arrastrar
// @react-pdf/renderer al bundle del cliente)
function numeroPropuestaFmt(n: number): string {
  return `PROP-${String(n).padStart(5, '0')}`
}

// Botón "Cotizar" + modal. Única definición del JSX: se instancia tanto en la
// columna izquierda de la vista desktop como en la barra superior de mobile.
export default function CotizadorLead({ leadId, mobile }: { leadId: string; mobile?: boolean }) {
  const [showModal, setShowModal] = useState(false)

  return (
    <>
      <div className={cn('px-4 py-2.5 border-b border-border', mobile && 'shrink-0')}>
        <button
          onClick={() => setShowModal(true)}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border text-foreground hover:bg-accent transition-colors',
            mobile && 'min-h-[44px] w-full justify-center text-sm',
          )}
        >
          <Calculator size={13} />
          Cotizar
        </button>
      </div>
      {showModal && <CotizarModal leadId={leadId} onClose={() => setShowModal(false)} />}
    </>
  )
}

function CotizarModal({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data: gramajes = [] } = useQuery<number[]>({
    queryKey: ['cotizador-gramajes'],
    queryFn: async () => {
      const res = await fetch('/api/cotizador/gramajes')
      if (!res.ok) throw new Error('Error al cargar gramajes')
      const json = await res.json() as { data: number[] }
      return json.data
    },
  })

  const [cantidad, setCantidad] = useState('')
  const [gramaje, setGramaje] = useState('')
  const [packaging, setPackaging] = useState<Packaging>('cristal')
  const [descuento, setDescuento] = useState('0')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Preseleccionar el primer gramaje disponible
  useEffect(() => {
    if (!gramaje && gramajes.length > 0) setGramaje(String(gramajes[0]))
  }, [gramajes, gramaje])

  // Cálculo en vivo con debounce
  const [debounced, setDebounced] = useState({ cantidad, gramaje, packaging, descuento })
  useEffect(() => {
    const t = setTimeout(() => setDebounced({ cantidad, gramaje, packaging, descuento }), 350)
    return () => clearTimeout(t)
  }, [cantidad, gramaje, packaging, descuento])

  const input = useMemo(() => {
    const cant = Number(debounced.cantidad)
    const gram = Number(debounced.gramaje)
    const desc = Number(debounced.descuento)
    const valido =
      Number.isInteger(cant) && cant > 0 &&
      Number.isInteger(gram) && gram > 0 &&
      Number.isFinite(desc) && desc >= 0 && desc <= 100
    return valido
      ? { cantidad: cant, gramaje: gram, packaging: debounced.packaging, descuentoManualPct: desc }
      : null
  }, [debounced])

  const { data: preview, isFetching, error: previewError } = useQuery<PreviewData, Error>({
    queryKey: ['cotizador-preview', input],
    queryFn: async () => {
      const res = await fetch('/api/cotizador/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const json = await res.json() as { data?: PreviewData; error?: string }
      if (!res.ok || !json.data) throw new Error(json.error ?? 'Error al calcular')
      return json.data
    },
    enabled: input !== null,
    retry: false,
    placeholderData: (prev) => prev,
  })

  async function handleConfirmar() {
    if (!input) return
    setSaveError(null)
    setIsSaving(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/propuestas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const json = await res.json() as { data?: { numero: number; estado: string }; error?: string }
      if (!res.ok || !json.data) {
        setSaveError(json.error ?? 'Error al crear la propuesta')
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['lead-propuestas', leadId] })
      toast.success(
        json.data.estado === 'pendiente_aprobacion'
          ? `Propuesta #${json.data.numero} creada — pendiente de aprobación`
          : `Propuesta #${json.data.numero} creada`,
      )
      onClose()
    } catch {
      setSaveError('Error de conexión')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <button className="absolute inset-0" onClick={onClose} aria-label="Cerrar" />
      <div className="relative bg-card border border-border rounded-lg p-5 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">Cotizar propuesta</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Cantidad *</label>
            <input
              autoFocus
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder="Ej: 1000"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Gramaje *</label>
            <select value={gramaje} onChange={(e) => setGramaje(e.target.value)} className={inputClass}>
              {gramajes.length === 0 && <option value="">Sin recetas activas</option>}
              {gramajes.map((g) => (
                <option key={g} value={g}>{g} g</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Packaging</label>
            <select
              value={packaging}
              onChange={(e) => setPackaging(e.target.value as Packaging)}
              className={inputClass}
            >
              <option value="cristal">Cristal</option>
              <option value="personalizado">Personalizado</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Desc. manual (%)</label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.01"
              value={descuento}
              onChange={(e) => setDescuento(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="mt-4 min-h-[120px]">
          {previewError ? (
            <p className="text-xs text-destructive py-3">{previewError.message}</p>
          ) : !preview ? (
            <p className="text-xs text-muted-foreground py-3">
              {input === null ? 'Completá cantidad y gramaje para calcular.' : 'Calculando...'}
            </p>
          ) : (
            <div className={cn(isFetching && 'opacity-60 transition-opacity')}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[11px] text-muted-foreground border-b border-border">
                      <th className="py-1.5 pr-2 font-medium">Cantidad</th>
                      <th className="py-1.5 pr-2 font-medium text-right">$/u</th>
                      <th className="py-1.5 pr-2 font-medium text-right">Neto</th>
                      <th className="py-1.5 pr-2 font-medium text-right">IVA</th>
                      <th className="py-1.5 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.escenarios.map((esc) => {
                      const margenReal = margenRealPct(esc)
                      const ganancia = esc.precioUnitNeto - esc.costoInsumosUnitario
                      return (
                        <Fragment key={esc.cantidad}>
                          <tr className={cn(esc.elegido && 'bg-primary/5 font-medium text-foreground')}>
                            <td className="pt-1.5 pr-2 tabular-nums">
                              {esc.cantidad.toLocaleString('es-AR')}
                              {esc.elegido && <span className="ml-1 text-[10px] text-primary">●</span>}
                            </td>
                            <td className="pt-1.5 pr-2 text-right tabular-nums">{fmt(esc.precioUnitNeto)}</td>
                            <td className="pt-1.5 pr-2 text-right tabular-nums">{fmt(esc.neto)}</td>
                            <td className="pt-1.5 pr-2 text-right tabular-nums">{fmt(esc.iva)}</td>
                            <td className="pt-1.5 text-right tabular-nums">{fmt(esc.total)}</td>
                          </tr>
                          {/* Rentabilidad interna del vendedor: no viaja al PDF */}
                          <tr className={cn('border-b border-border/60', esc.elegido && 'bg-primary/5')}>
                            <td colSpan={5} className="pb-1.5 text-[10px] text-muted-foreground">
                              Interno · costo {fmt(esc.costoInsumosUnitario)}/u · ganancia {fmt(ganancia)}/u ·{' '}
                              <span className={cn('font-medium', margenColorClass(margenReal, preview.margenObjetivoPct))}>
                                margen {margenReal.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                              </span>
                            </td>
                          </tr>
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Validez: {preview.validezDias} días.
                {preview.escenarios[0] && preview.escenarios[0].setup > 0 &&
                  ` Incluye setup de packaging: ${fmt(preview.escenarios[0].setup)}.`}
              </p>
              {preview.requiereAprobacion && (
                <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle size={12} />
                  El descuento supera el tope ({preview.topeDescuentoPct}%): la propuesta queda pendiente de aprobación.
                </p>
              )}
            </div>
          )}
        </div>

        {saveError && <p className="mt-2 text-xs text-destructive">{saveError}</p>}

        <div className="flex gap-2 mt-4">
          <button
            onClick={handleConfirmar}
            disabled={isSaving || !input || !preview}
            className="px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Creando...' : 'Crear propuesta'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

export function PropuestasList({ leadId, mobile }: { leadId: string; mobile?: boolean }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [enviando, setEnviando] = useState<string | null>(null)
  const [eliminando, setEliminando] = useState<PropuestaResumen | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data: propuestas = [], isLoading } = useQuery<PropuestaResumen[]>({
    queryKey: ['lead-propuestas', leadId],
    queryFn: async () => {
      const res = await fetch(`/api/leads/${leadId}/propuestas`)
      if (!res.ok) throw new Error('Error al cargar propuestas')
      const json = await res.json() as { data: PropuestaResumen[] }
      return json.data
    },
  })

  async function registrarEnvio(propuestaId: string, via: 'descarga' | 'whatsapp' | 'email') {
    setEnviando(`${propuestaId}:${via}`)
    try {
      const res = await fetch(`/api/propuestas/${propuestaId}/enviar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ via }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) {
        toast.error(json.error ?? 'Error al enviar la propuesta')
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['lead-propuestas', leadId] })
      void queryClient.invalidateQueries({ queryKey: ['activity', leadId] })
      toast.success(
        via === 'whatsapp' ? 'Propuesta enviada por WhatsApp'
        : via === 'email' ? 'Propuesta enviada por email'
        : 'Descarga registrada — propuesta marcada como enviada',
      )
    } catch {
      toast.error('Error de conexión')
    } finally {
      setEnviando(null)
    }
  }

  function descargar(p: PropuestaResumen) {
    window.open(`/api/propuestas/${p.id}/pdf`, '_blank')
    void registrarEnvio(p.id, 'descarga')
  }

  async function handleDelete() {
    if (!eliminando) return
    setDeleteError(null)
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/propuestas/${eliminando.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json() as { error?: string }
        // Un 403 (o cualquier error) se muestra dentro del modal, sin cerrarlo
        setDeleteError(json.error ?? 'Error al eliminar la propuesta')
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['lead-propuestas', leadId] })
      void queryClient.invalidateQueries({ queryKey: ['activity', leadId] })
      toast.success(`Propuesta ${numeroPropuestaFmt(eliminando.numero)} eliminada`)
      setEliminando(null)
    } catch {
      setDeleteError('Error de conexión')
    } finally {
      setIsDeleting(false)
    }
  }

  if (isLoading || propuestas.length === 0) return null

  return (
    <div className="px-4 py-2.5 border-b border-border">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
        Propuestas
      </p>
      <div className="flex flex-col gap-1.5">
        {propuestas.map((p) => {
          const pendiente = p.estado === 'pendiente_aprobacion'
          const busy = enviando?.startsWith(`${p.id}:`) ?? false
          const accionClass = cn(
            'p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
            'disabled:opacity-40 disabled:pointer-events-none',
            mobile && 'min-h-[44px] min-w-[44px] flex items-center justify-center',
          )
          return (
            <div key={p.id} className="flex flex-col gap-0.5 p-2 rounded-md border border-border">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground">
                  #{p.numero} · {p.cantidad.toLocaleString('es-AR')} u × {p.gramaje} g
                </span>
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0',
                  ESTADO_PROPUESTA_COLOR[p.estado],
                )}>
                  {ESTADO_PROPUESTA_LABEL[p.estado]}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {formatFechaInstanteAR(p.fecha, true)} · vence {formatFechaAR(p.vigenteHasta, true)}
                </span>
                <span className="text-xs font-medium text-foreground tabular-nums">{fmt(p.total)}</span>
              </div>
              <div className="flex items-center gap-1 mt-1">
                <button
                  onClick={() => descargar(p)}
                  disabled={pendiente || busy}
                  className={accionClass}
                  title={pendiente ? 'Pendiente de aprobación del descuento' : 'Descargar PDF'}
                >
                  <Download size={13} />
                </button>
                <button
                  onClick={() => { void registrarEnvio(p.id, 'whatsapp') }}
                  disabled={pendiente || busy}
                  className={accionClass}
                  title={pendiente ? 'Pendiente de aprobación del descuento' : 'Enviar por WhatsApp'}
                >
                  <MessageCircle size={13} />
                </button>
                <button
                  onClick={() => { void registrarEnvio(p.id, 'email') }}
                  disabled={pendiente || busy}
                  className={accionClass}
                  title={pendiente ? 'Pendiente de aprobación del descuento' : 'Enviar por email'}
                >
                  <Mail size={13} />
                </button>
                {busy && <span className="text-[10px] text-muted-foreground">Enviando...</span>}
                <button
                  onClick={() => { setDeleteError(null); setEliminando(p) }}
                  disabled={busy || isDeleting}
                  aria-label="Eliminar propuesta"
                  title="Eliminar propuesta"
                  className={cn(
                    'ml-auto p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors',
                    'disabled:opacity-40 disabled:pointer-events-none',
                    mobile && 'min-h-[44px] min-w-[44px] flex items-center justify-center',
                  )}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {eliminando && (
        <ConfirmDeleteModal
          title="Eliminar propuesta"
          description={`¿Eliminar la propuesta ${numeroPropuestaFmt(eliminando.numero)}? Esta acción no se puede deshacer.`}
          warning={deleteError ?? undefined}
          onConfirm={() => { void handleDelete() }}
          onClose={() => { setEliminando(null); setDeleteError(null) }}
          isPending={isDeleting}
        />
      )}
    </div>
  )
}
