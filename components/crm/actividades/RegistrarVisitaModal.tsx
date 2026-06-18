'use client'

import { useState } from 'react'
import { X, MapPin, Loader2, Check, XCircle, UserX, CalendarClock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/shared/ToastProvider'

type Resultado = 'compro' | 'no_compro' | 'no_estaba' | 'reprogramar'

const RESULTADOS: { value: Resultado; label: string; icon: typeof Check; active: string }[] = [
  { value: 'compro', label: 'Compró', icon: Check, active: 'bg-green-600 text-white border-green-600' },
  { value: 'no_compro', label: 'No compró', icon: XCircle, active: 'bg-red-600 text-white border-red-600' },
  { value: 'no_estaba', label: 'No estaba', icon: UserX, active: 'bg-amber-600 text-white border-amber-600' },
  { value: 'reprogramar', label: 'Reprogramar', icon: CalendarClock, active: 'bg-blue-600 text-white border-blue-600' },
]

type Geo = { lat: number; lng: number; precision: number | null }

/** Captura la ubicación; nunca rechaza: resuelve a null si falla o se niega. */
function captureGeo(): Promise<Geo | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, precision: pos.coords.accuracy ?? null }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    )
  })
}

type Props = {
  clienteId: string
  onClose: () => void
  /** Refresca la lista de actividades en el padre. */
  onRegistered: () => void
}

const inputClass = cn(
  'w-full px-3 py-2.5 md:py-1.5 text-[16px] md:text-sm rounded-md border',
  'border-border bg-background text-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring transition-colors',
)

export default function RegistrarVisitaModal({ clienteId, onClose, onRegistered }: Props) {
  const toast = useToast()
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [notas, setNotas] = useState('')
  const [proximaVisita, setProximaVisita] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function registrar(res: Resultado) {
    if (res === 'reprogramar' && !proximaVisita) {
      setError('Elegí la fecha de la próxima visita')
      return
    }
    setError(null)
    setSubmitting(true)

    // Ubicación: nunca bloquea el registro.
    const geo = await captureGeo()

    try {
      const r = await fetch(`/api/clientes/${clienteId}/visitas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resultado: res,
          notas: notas.trim() || null,
          lat: geo?.lat ?? null,
          lng: geo?.lng ?? null,
          precision: geo?.precision ?? null,
          proximaVisita:
            res === 'reprogramar' && proximaVisita ? new Date(proximaVisita).toISOString() : null,
        }),
      })
      if (!r.ok) {
        const d = (await r.json()) as { error?: string }
        setError(d.error ?? 'Error al registrar la visita')
        setSubmitting(false)
        return
      }
      onRegistered()
      toast.success('Visita registrada')
      if (!geo) toast.info('Ubicación no disponible')
      onClose()
    } catch {
      setError('Error de conexión')
      setSubmitting(false)
    }
  }

  function handleResultClick(res: Resultado) {
    if (submitting) return
    setResultado(res)
    setError(null)
    // Camino rápido (≤2 toques): los resultados sin requisitos extra se registran al toque.
    if (res !== 'reprogramar') {
      void registrar(res)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <button className="absolute inset-0" onClick={submitting ? undefined : onClose} aria-label="Cerrar" />
      <div className="relative bg-card border border-border rounded-2xl p-5 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <MapPin size={16} className="text-purple-600" />
            Registrar visita
          </h2>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        {/* Resultado: tocar registra al instante (salvo reprogramar) */}
        <p className="text-xs text-muted-foreground mb-2">¿Cómo salió la visita?</p>
        <div className="grid grid-cols-2 gap-2">
          {RESULTADOS.map((r) => {
            const Icon = r.icon
            const isActive = resultado === r.value
            return (
              <button
                key={r.value}
                type="button"
                disabled={submitting}
                onClick={() => handleResultClick(r.value)}
                className={cn(
                  'flex items-center justify-center gap-2 px-3 py-4 rounded-xl border text-sm font-semibold transition-colors disabled:opacity-50',
                  isActive ? r.active : 'border-border text-foreground hover:bg-accent',
                )}
              >
                <Icon size={18} />
                {r.label}
              </button>
            )
          })}
        </div>

        {/* Próxima visita (solo reprogramar) */}
        {resultado === 'reprogramar' && (
          <div className="mt-3">
            <label className="block text-xs text-muted-foreground mb-1">Próxima visita *</label>
            <input
              type="datetime-local"
              value={proximaVisita}
              onChange={(e) => setProximaVisita(e.target.value)}
              disabled={submitting}
              className={inputClass}
            />
          </div>
        )}

        {/* Nota opcional */}
        <div className="mt-3">
          <label className="block text-xs text-muted-foreground mb-1">Nota (opcional)</label>
          <textarea
            rows={2}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            disabled={submitting}
            placeholder="Detalle de la visita..."
            className={cn(inputClass, 'resize-none')}
          />
        </div>

        {error && <p className="text-xs text-destructive mt-2">{error}</p>}

        {/* Confirmar: solo necesario para reprogramar (los demás se registran al toque) */}
        {resultado === 'reprogramar' && (
          <button
            type="button"
            onClick={() => void registrar('reprogramar')}
            disabled={submitting}
            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {submitting ? 'Registrando...' : 'Confirmar reprogramación'}
          </button>
        )}

        {/* Overlay de carga para el camino rápido */}
        {submitting && resultado !== 'reprogramar' && (
          <div className="absolute inset-0 bg-card/80 rounded-2xl flex flex-col items-center justify-center gap-2">
            <Loader2 size={24} className="animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Registrando visita...</p>
          </div>
        )}
      </div>
    </div>
  )
}
