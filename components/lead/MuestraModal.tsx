'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Stepper from '@/components/shared/Stepper'
import MetodoEntregaStep from '@/components/crm/pedidos/MetodoEntregaStep'
import {
  ENTREGA_FORM_INICIAL,
  buildEntregaPayload,
  entregaCompleta,
  type EntregaFormState,
  type ExpresoGuardado,
} from '@/lib/pedidos/metodo-entrega'

type Props = {
  leadId: string
  onClose: () => void
  onCreated: (pedidoId: string) => void
}

type MuestraInfo = {
  cliente: { id: string; expresoNombre: string | null; expresoDireccion: string | null } | null
}

/**
 * Modal para cargar la muestra CDA desde el lead. Antes de crear el pedido pide
 * el mismo paso "Entrega" que usan los agentes (retiro en fábrica / expreso y
 * cuál), así fábrica sabe qué muestras se retiran y cuáles hay que despachar.
 * El pedido nace siempre en "pendiente de aprobación".
 */
export default function MuestraModal({ leadId, onClose, onCreated }: Props) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<EntregaFormState>(ENTREGA_FORM_INICIAL)
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Si el lead ya tiene cliente vinculado, ofrecemos su expreso guardado.
  const { data: info } = useQuery<MuestraInfo | null>({
    queryKey: ['lead-muestra-info', leadId],
    queryFn: async () => {
      const res = await fetch(`/api/leads/${leadId}/muestra`)
      if (!res.ok) return null
      const json = await res.json() as { data: MuestraInfo }
      return json.data
    },
    staleTime: 30_000,
  })

  const expresoGuardado: ExpresoGuardado = info?.cliente?.expresoNombre
    ? { nombre: info.cliente.expresoNombre, direccion: info.cliente.expresoDireccion }
    : null

  const puedeConfirmar = entregaCompleta(form, expresoGuardado)

  async function handleSubmit() {
    if (!puedeConfirmar || isPending) return
    const payload = buildEntregaPayload(form, expresoGuardado)
    if (!payload) return
    setIsPending(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${leadId}/muestra`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json() as { data?: { pedidoId: string }; error?: string }
      if (!res.ok || !json.data) {
        setError(json.error ?? 'Error al crear el pedido de muestra')
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['activity', leadId] })
      void queryClient.invalidateQueries({ queryKey: ['pedidos'] })
      void queryClient.invalidateQueries({ queryKey: ['lead-muestra-info', leadId] })
      // El lead pasa a la etapa "Muestra enviada": refrescar panel y kanban
      void queryClient.invalidateQueries({ queryKey: ['lead', leadId] })
      void queryClient.invalidateQueries({ queryKey: ['leads-list'] })
      void queryClient.invalidateQueries({ queryKey: ['leads-col'] })
      void queryClient.invalidateQueries({ queryKey: ['pipeline-stats'] })
      onCreated(json.data.pedidoId)
    } catch {
      setError('Error de red al crear el pedido')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-card md:bg-black/50 md:items-center md:justify-center">
      <div className="flex flex-col h-full w-full bg-card md:h-auto md:max-h-[90vh] md:rounded-lg md:border md:border-border md:shadow-xl md:max-w-2xl">
        <Stepper steps={['Entrega de la muestra']} currentStep={0} onClose={onClose} />

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <p className="text-sm text-muted-foreground">
            Se va a crear un pedido de <span className="font-medium text-foreground">muestra CDA</span> (1 unidad)
            que queda <span className="font-medium text-foreground">pendiente de aprobación</span>. El precio
            simbólico de la muestra se salda automáticamente, así el cliente no queda con deuda.
          </p>
          <MetodoEntregaStep form={form} onChange={setForm} expresoGuardado={expresoGuardado} />
        </div>

        <div className="p-4 border-t border-border bg-card shrink-0">
          {error && <p className="text-sm text-destructive mb-3">{error}</p>}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!puedeConfirmar || isPending}
            className="w-full py-4 bg-primary text-primary-foreground rounded-xl text-base font-semibold disabled:opacity-50"
          >
            {isPending ? 'Creando pedido...' : 'Cargar muestra'}
          </button>
        </div>
      </div>
    </div>
  )
}
