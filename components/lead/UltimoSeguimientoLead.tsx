'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Hourglass, Send, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatFechaHoraAR } from '@/lib/dates'
import { useToast } from '@/components/shared/ToastProvider'
import { REASON_ULTIMO_SEGUIMIENTO } from '@/lib/followup/ultimo-seguimiento'

/** Campos del lead que definen el estado del botón (vienen con GET /api/leads/[id]). */
export type SeguimientoLead = {
  followUpReason: string | null
  followUpStatus: string | null
  nextFollowUpAt: Date | string | null
  ultimoSeguimientoAt: Date | string | null
}

type Props = {
  leadId: string
  seguimiento?: SeguimientoLead | null
  mobile?: boolean
}

type Preview = {
  disponible: boolean
  motivo: string | null
  body: string | null
  cierraEl: string
  templateName: string
}

// Queries que muestran el estado del seguimiento o el chat
const QUERIES_A_REFRESCAR = (leadId: string) => [
  ['lead', leadId],
  ['leads-col'],
  ['leads-list'],
  ['inbox'],
  ['messages'],
]

// Botón "Último seguimiento" del panel del lead: manda la plantilla aprobada y,
// si no responde en las horas configuradas, el lead pasa a Perdido. Mientras
// espera, el botón muestra cuándo cierra y permite cancelar.
export default function UltimoSeguimientoButton({ leadId, seguimiento, mobile }: Props) {
  const [open, setOpen] = useState(false)
  const esperando =
    seguimiento?.followUpReason === REASON_ULTIMO_SEGUIMIENTO &&
    seguimiento.followUpStatus === 'pending' &&
    !!seguimiento.nextFollowUpAt

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={
          esperando
            ? `Último seguimiento enviado. Si no responde antes del ${formatFechaHoraAR(seguimiento.nextFollowUpAt!)} pasa a Perdido`
            : 'Mandar la plantilla de último seguimiento y cerrar el lead si no responde'
        }
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors',
          esperando
            ? 'border-amber-500 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50'
            : 'border-border text-foreground hover:bg-accent',
          mobile && 'min-h-[44px] flex-1 justify-center text-sm',
        )}
      >
        {esperando ? <Hourglass size={13} /> : <Send size={13} />}
        {esperando ? `Cierra ${formatFechaHoraAR(seguimiento.nextFollowUpAt!, true)}` : 'Último seguimiento'}
      </button>
      {open && (
        <UltimoSeguimientoModal
          leadId={leadId}
          esperando={esperando ? { enviadoAt: seguimiento.ultimoSeguimientoAt, cierraEl: seguimiento.nextFollowUpAt! } : null}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

type ModalProps = {
  leadId: string
  /** Si ya se mandó y espera respuesta: cuándo se mandó y cuándo cierra */
  esperando: { enviadoAt: Date | string | null; cierraEl: Date | string } | null
  onClose: () => void
}

function UltimoSeguimientoModal({ leadId, esperando, onClose }: ModalProps) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [cargando, setCargando] = useState(!esperando)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (esperando) return
    let activo = true
    fetch(`/api/leads/${leadId}/ultimo-seguimiento`)
      .then(async (res) => {
        const json = await res.json() as { data?: Preview; error?: string }
        if (!activo) return
        if (!res.ok || !json.data) {
          setPreview({ disponible: false, motivo: json.error ?? 'No se pudo armar la vista previa', body: null, cierraEl: new Date().toISOString(), templateName: '' })
        } else {
          setPreview(json.data)
        }
      })
      .catch(() => {
        if (activo) setPreview({ disponible: false, motivo: 'Error de conexión', body: null, cierraEl: new Date().toISOString(), templateName: '' })
      })
      .finally(() => {
        if (activo) setCargando(false)
      })
    return () => {
      activo = false
    }
  }, [leadId, esperando])

  function refrescar() {
    for (const queryKey of QUERIES_A_REFRESCAR(leadId)) {
      void queryClient.invalidateQueries({ queryKey })
    }
  }

  async function enviar() {
    setSaving(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/ultimo-seguimiento`, { method: 'POST' })
      const json = await res.json() as { data?: { cierraEl: string }; error?: string }
      if (!res.ok || !json.data) {
        toast.error(json.error ?? 'No se pudo mandar el último seguimiento')
        return
      }
      toast.success(`Último seguimiento enviado. Si no responde, cierra el ${formatFechaHoraAR(json.data.cierraEl)}`)
      refrescar()
      onClose()
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  async function cancelarCierre() {
    setSaving(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/ultimo-seguimiento`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json() as { error?: string }
        toast.error(json.error ?? 'No se pudo cancelar el cierre')
        return
      }
      toast.success('Cierre cancelado: el lead sigue abierto')
      refrescar()
      onClose()
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ultimo-seguimiento-titulo"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id="ultimo-seguimiento-titulo" className="text-base font-semibold text-foreground">
              {esperando ? 'Último seguimiento enviado' : 'Mandar último seguimiento'}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {esperando
                ? 'Está esperando respuesta. Si no llega a tiempo, el lead pasa a Perdido.'
                : 'Se manda la plantilla por WhatsApp y arranca el plazo para cerrar el lead.'}
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

        {esperando ? (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-sm space-y-1">
            {esperando.enviadoAt && (
              <p className="text-muted-foreground">Enviado el {formatFechaHoraAR(esperando.enviadoAt)}.</p>
            )}
            <p className="text-foreground">
              Si no responde antes del <span className="font-medium">{formatFechaHoraAR(esperando.cierraEl)}</span> pasa a
              Perdido (Dejó de responder).
            </p>
            <p className="text-muted-foreground">
              Si responde, el cierre se cancela solo. En &quot;Nuevo&quot; contesta el bot; en otra etapa te queda a vos.
              Las respuestas automáticas de negocios no cuentan.
            </p>
          </div>
        ) : cargando ? (
          <p className="text-sm text-muted-foreground">Armando la vista previa…</p>
        ) : preview ? (
          <div className="space-y-3">
            {preview.body && (
              <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/40 px-3 py-2 text-sm text-foreground whitespace-pre-wrap">
                {preview.body}
              </div>
            )}
            {preview.disponible ? (
              <p className="text-sm text-muted-foreground">
                Si no responde antes del <span className="font-medium text-foreground">{formatFechaHoraAR(preview.cierraEl)}</span> pasa
                a Perdido (Dejó de responder). Si responde, el cierre se cancela: en &quot;Nuevo&quot; contesta el bot, en otra
                etapa te queda a vos.
              </p>
            ) : (
              <p className="text-sm text-red-600 dark:text-red-400">{preview.motivo}</p>
            )}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-accent transition-colors"
          >
            {esperando ? 'Cerrar' : 'Cancelar'}
          </button>
          {esperando ? (
            <button
              type="button"
              onClick={() => void cancelarCierre()}
              disabled={saving}
              className="px-3 py-1.5 text-sm rounded-md border border-red-500 text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/30 disabled:opacity-50 transition-colors"
            >
              Cancelar el cierre
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void enviar()}
              disabled={saving || cargando || !preview?.disponible}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Send size={13} />
              Enviar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
