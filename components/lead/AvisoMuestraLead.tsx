'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { Check, ExternalLink, Send, Truck, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatFechaInstanteAR } from '@/lib/dates'
import { useToast } from '@/components/shared/ToastProvider'
import { esperaAvisoMuestra, type EstadoAvisoMuestra } from '@/lib/leads/muestra-aviso'

type Props = {
  leadId: string
  /** Campos del lead (vienen con GET /api/leads/[id]) */
  aviso: EstadoAvisoMuestra | null | undefined
  mobile?: boolean
}

type Preview = {
  disponible: boolean
  motivo: string | null
  body: string | null
  fotoKey: string | null
  pedidoId: string | null
  avisadaAt: string | null
  templateName: string | null
  expresoNombre: string | null
}

// Queries que muestran el estado del aviso o el chat
const QUERIES_A_REFRESCAR = (leadId: string) => [
  ['lead', leadId],
  ['leads-col'],
  ['leads-list'],
  ['inbox'],
  ['messages'],
  ['muestras-sin-avisar'],
  ['dashboard-hoy'],
]

/**
 * Botón "Avisar que salió la muestra" del panel del lead: manda la plantilla
 * aprobada con la foto de la guía de envío en el encabezado (sirve fuera de
 * la ventana de 24 hs). Cuando ya se avisó, muestra la fecha.
 */
export default function AvisoMuestraButton({ leadId, aviso, mobile }: Props) {
  const [open, setOpen] = useState(false)
  if (!aviso?.muestraEntregadaAt) return null
  const pendiente = esperaAvisoMuestra(aviso)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={
          pendiente
            ? 'Mandarle al cliente la plantilla con la guía de envío de la muestra'
            : `Aviso de muestra enviado el ${formatFechaInstanteAR(aviso.muestraAvisadaAt!)}`
        }
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors',
          pendiente
            ? 'border-purple-500 bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50'
            : 'border-border text-muted-foreground hover:bg-accent',
          mobile && 'min-h-[44px] flex-1 justify-center text-sm',
        )}
      >
        {pendiente ? <Truck size={13} /> : <Check size={13} />}
        {pendiente ? 'Avisar que salió la muestra' : `Muestra avisada ${formatFechaInstanteAR(aviso.muestraAvisadaAt!, true)}`}
      </button>
      {open && <AvisoMuestraModal leadId={leadId} onClose={() => setOpen(false)} />}
    </>
  )
}

function AvisoMuestraModal({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [cargando, setCargando] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let activo = true
    // reenviar=1: la vista previa se arma aunque ya se haya avisado, para poder mandarlo de nuevo
    fetch(`/api/leads/${leadId}/muestra/aviso?reenviar=1`)
      .then(async (res) => {
        const json = await res.json() as { data?: Preview; error?: string }
        if (!activo) return
        if (!res.ok || !json.data) {
          setPreview({
            disponible: false,
            motivo: json.error ?? 'No se pudo armar la vista previa',
            body: null, fotoKey: null, pedidoId: null, avisadaAt: null, templateName: null, expresoNombre: null,
          })
        } else {
          setPreview(json.data)
        }
      })
      .catch(() => {
        if (activo) {
          setPreview({
            disponible: false, motivo: 'Error de conexión',
            body: null, fotoKey: null, pedidoId: null, avisadaAt: null, templateName: null, expresoNombre: null,
          })
        }
      })
      .finally(() => {
        if (activo) setCargando(false)
      })
    return () => {
      activo = false
    }
  }, [leadId])

  function refrescar() {
    for (const queryKey of QUERIES_A_REFRESCAR(leadId)) {
      void queryClient.invalidateQueries({ queryKey })
    }
  }

  async function enviar(soloMarcar: boolean, reenviar = false) {
    setSaving(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/muestra/aviso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soloMarcar, reenviar }),
      })
      const json = await res.json() as { data?: { enviado: boolean }; error?: string }
      if (!res.ok || !json.data) {
        toast.error(json.error ?? 'No se pudo mandar el aviso')
        return
      }
      toast.success(soloMarcar ? 'Muestra marcada como avisada' : reenviar ? 'Aviso reenviado con la guía de envío' : 'Aviso enviado con la guía de envío')
      refrescar()
      onClose()
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  const yaAvisada = !!preview?.avisadaAt
  const fotoSrc = preview?.fotoKey ? `/api/attachments/url?key=${encodeURIComponent(preview.fotoKey)}` : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="aviso-muestra-titulo"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id="aviso-muestra-titulo" className="text-base font-semibold text-foreground">
              {yaAvisada ? 'Aviso de muestra enviado' : 'Avisar que salió la muestra'}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {yaAvisada
                ? `Se le avisó al cliente el ${formatFechaInstanteAR(preview!.avisadaAt!)}. Si hace falta, podés mandarlo de nuevo.`
                : 'Se manda la plantilla por WhatsApp con la foto de la guía de envío arriba del texto.'}
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

        {cargando ? (
          <p className="text-sm text-muted-foreground">Armando la vista previa…</p>
        ) : preview ? (
          <div className="space-y-3">
            {(fotoSrc || preview.body) && (
              <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/40 overflow-hidden">
                {fotoSrc && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fotoSrc} alt="Foto de la guía de envío" className="w-full max-h-64 object-contain bg-black/5" />
                )}
                {preview.body && (
                  <p className="px-3 py-2 text-sm text-foreground whitespace-pre-wrap">{preview.body}</p>
                )}
              </div>
            )}
            {preview.expresoNombre && (
              <p className="text-xs text-muted-foreground">Salió por {preview.expresoNombre}.</p>
            )}
            {!preview.disponible && (
              <p className="text-sm text-red-600 dark:text-red-400">{preview.motivo}</p>
            )}
            {preview.pedidoId && (
              <Link
                href={`/crm/pedidos/${preview.pedidoId}`}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink size={12} />
                Ver el pedido de la muestra
              </Link>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-accent transition-colors"
          >
            {yaAvisada ? 'Cerrar' : 'Cancelar'}
          </button>
          {!yaAvisada && !cargando && (
            <button
              type="button"
              onClick={() => void enviar(true)}
              disabled={saving}
              title="Sacarlo de pendientes sin mandar nada (ya le avisaste por otro lado)"
              className="px-3 py-1.5 text-sm rounded-md border border-border text-muted-foreground hover:bg-accent disabled:opacity-50 transition-colors"
            >
              Ya le avisé
            </button>
          )}
          <button
            type="button"
            onClick={() => void enviar(false, yaAvisada)}
            disabled={saving || cargando || !preview?.disponible}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md disabled:opacity-50 transition-colors',
              yaAvisada
                ? 'border border-border text-foreground hover:bg-accent'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            <Send size={13} />
            {saving ? 'Enviando…' : yaAvisada ? 'Enviar de nuevo' : 'Enviar con la guía'}
          </button>
        </div>
      </div>
    </div>
  )
}
