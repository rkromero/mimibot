'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { todayStrAR, formatFechaAR } from '@/lib/dates'
import { useToast } from '@/components/shared/ToastProvider'
import {
  ATAJOS_RECORDATORIO,
  RECORDATORIO_NOTA_MAX,
  estadoRecordatorio,
  etiquetaRecordatorio,
  fechaAtajo,
} from '@/lib/leads/recordatorio'

type Props = {
  leadId: string
  /** YYYY-MM-DD (viene con el lead de GET /api/leads/[id]) */
  recordatorioAt?: string | null
  recordatorioNota?: string | null
  mobile?: boolean
}

const COLOR_BOTON = {
  vencido: 'border-red-500 bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50',
  hoy: 'border-amber-500 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50',
  proximo: 'border-sky-500 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-900/30 dark:text-sky-300 dark:hover:bg-sky-900/50',
} as const

const inputClass = cn(
  'w-full px-3 py-2 text-sm rounded-md border',
  'border-border bg-background text-foreground placeholder:text-muted-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring',
)

// Botón "Recordar" del panel del lead (a la derecha de "Agendar llamada"):
// anota el día en que hay que volver a llamarlo y una nota. Si ya hay uno,
// el botón muestra la fecha (rojo vencido, ámbar hoy, celeste próximo) y abre
// el mismo modal para cambiarlo o darlo por hecho.
export default function RecordatorioLeadButton({ leadId, recordatorioAt, recordatorioNota, mobile }: Props) {
  const [open, setOpen] = useState(false)
  const hoy = todayStrAR()
  const estado = recordatorioAt ? estadoRecordatorio(recordatorioAt, hoy) : null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={
          recordatorioAt
            ? `Llamar el ${formatFechaAR(recordatorioAt)}${recordatorioNota ? ` · ${recordatorioNota}` : ''}`
            : 'Anotar cuándo volver a llamarlo'
        }
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors',
          estado ? COLOR_BOTON[estado] : 'border-border text-foreground hover:bg-accent',
          mobile && 'min-h-[44px] flex-1 justify-center text-sm',
        )}
      >
        <CalendarClock size={13} />
        {recordatorioAt ? etiquetaRecordatorio(recordatorioAt, hoy) : 'Recordar'}
      </button>
      {open && (
        <RecordatorioModal
          leadId={leadId}
          actual={recordatorioAt ? { fecha: recordatorioAt, nota: recordatorioNota ?? null } : null}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

type ModalProps = {
  leadId: string
  actual: { fecha: string; nota: string | null } | null
  onClose: () => void
}

// Queries que muestran el recordatorio: panel, kanban, lista, inbox, popup y Mi día
const QUERIES_A_REFRESCAR = (leadId: string) => [
  ['lead', leadId],
  ['leads-col'],
  ['leads-list'],
  ['inbox'],
  ['recordatorios-hoy'],
  ['dashboard-hoy'],
]

function RecordatorioModal({ leadId, actual, onClose }: ModalProps) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const hoy = todayStrAR()
  const [fecha, setFecha] = useState(actual?.fecha ?? '')
  const [nota, setNota] = useState(actual?.nota ?? '')
  const [saving, setSaving] = useState(false)

  function refrescar() {
    for (const queryKey of QUERIES_A_REFRESCAR(leadId)) {
      void queryClient.invalidateQueries({ queryKey })
    }
  }

  async function guardar() {
    if (!fecha) {
      toast.error('Elegí el día en que hay que llamarlo')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/recordatorio`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, nota: nota.trim() || null }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        toast.error(data.error ?? 'No se pudo guardar el recordatorio')
        return
      }
      toast.success(`Te lo recordamos el ${formatFechaAR(fecha)}`)
      refrescar()
      onClose()
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  async function marcarHecho() {
    setSaving(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/recordatorio`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        toast.error(data.error ?? 'No se pudo cerrar el recordatorio')
        return
      }
      toast.success('Recordatorio cumplido')
      refrescar()
      onClose()
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  const atajoActivo = ATAJOS_RECORDATORIO.find((a) => fechaAtajo(a.value, hoy) === fecha)?.value

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recordatorio-lead-titulo"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id="recordatorio-lead-titulo" className="text-base font-semibold text-foreground">
              Recordatorio para llamar
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Ese día te lo mostramos al abrir el sistema y en Mi día.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {actual && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <span className="min-w-0 truncate">
              <span className="font-medium text-foreground">{etiquetaRecordatorio(actual.fecha, hoy)}</span>
              {actual.nota && <span className="text-muted-foreground"> · {actual.nota}</span>}
            </span>
            <button
              type="button"
              onClick={() => void marcarHecho()}
              disabled={saving}
              className="inline-flex items-center gap-1 shrink-0 text-xs font-medium text-green-700 hover:text-green-800 dark:text-green-400 disabled:opacity-50"
            >
              <Check size={13} />
              Ya lo llamé
            </button>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">¿Cuándo?</label>
          <div className="flex flex-wrap gap-1.5">
            {ATAJOS_RECORDATORIO.map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={() => setFecha(fechaAtajo(a.value, hoy))}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-full border transition-colors',
                  atajoActivo === a.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-foreground hover:bg-accent',
                )}
              >
                {a.label}
              </button>
            ))}
          </div>
          <input
            type="date"
            value={fecha}
            min={hoy}
            onChange={(e) => setFecha(e.target.value)}
            className={inputClass}
            aria-label="Fecha del recordatorio"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Nota (opcional)</label>
          <input
            type="text"
            value={nota}
            maxLength={RECORDATORIO_NOTA_MAX}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ej.: arrancan en noviembre, llamar a Juan"
            className={inputClass}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-accent transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={saving || !fecha}
            className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {actual ? 'Cambiar' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
