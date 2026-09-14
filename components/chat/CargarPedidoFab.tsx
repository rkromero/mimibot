'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus, ShoppingCart } from 'lucide-react'
import CreatePedidoModal from '@/components/crm/pedidos/CreatePedidoModal'
import { useToast } from '@/components/shared/ToastProvider'
import { useStages } from '@/components/lead/useMoverEtapaLead'
import { cn } from '@/lib/utils'

type Props = {
  /** Lead de la conversación (null si es una conversación de cliente) */
  leadId?: string | null
  /** Cliente ya conocido (conversación de cliente, o lead ya convertido) */
  clienteId?: string | null
  className?: string
}

/**
 * Botón flotante "+ Cargar pedido" sobre el chat.
 *
 * - Conversación de cliente: abre el alta de pedido con ese cliente elegido.
 * - Conversación de lead: primero asegura la ficha de cliente (la crea con
 *   los datos del lead o vincula la existente) y abre el alta con ella.
 *   Cuando el pedido queda registrado, el lead pasa solo a "Ganado": se
 *   cierra en el pipeline y la conversación sigue como la del cliente.
 */
export default function CargarPedidoFab({ leadId, clienteId, className }: Props) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { data: stages = [] } = useStages()
  const [preparando, setPreparando] = useState(false)
  const [clienteListo, setClienteListo] = useState<string | null>(clienteId ?? null)
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    setClienteListo(clienteId ?? null)
    setAbierto(false)
  }, [clienteId, leadId])

  async function abrir() {
    if (preparando) return
    if (clienteListo) {
      setAbierto(true)
      return
    }
    if (!leadId) return
    setPreparando(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/cliente`, { method: 'POST' })
      const json = (await res.json()) as { data?: { clienteId: string; wasNew: boolean }; error?: string }
      if (!res.ok || !json.data) {
        toast.error(json.error ?? 'No se pudo preparar el cliente')
        return
      }
      setClienteListo(json.data.clienteId)
      if (json.data.wasNew) toast.info('Cliente creado con los datos del lead')
      void queryClient.invalidateQueries({ queryKey: ['clientes'] })
      setAbierto(true)
    } catch {
      toast.error('Error de conexión')
    } finally {
      setPreparando(false)
    }
  }

  async function marcarGanado() {
    if (!leadId) return
    const ganado = stages.find((s) => s.isWon)
    if (!ganado) return
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId: ganado.id }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        toast.error(data.error ?? 'El pedido se registró, pero no se pudo marcar el lead como ganado')
        return
      }
      toast.success(`Lead marcado como "${ganado.name}"`)
    } catch {
      toast.error('El pedido se registró, pero no se pudo marcar el lead como ganado')
    } finally {
      void queryClient.invalidateQueries({ queryKey: ['lead', leadId] })
      void queryClient.invalidateQueries({ queryKey: ['inbox'] })
      void queryClient.invalidateQueries({ queryKey: ['leads-col'] })
      void queryClient.invalidateQueries({ queryKey: ['leads-list'] })
      void queryClient.invalidateQueries({ queryKey: ['pipeline-stats'] })
    }
  }

  function onPedidoCreado() {
    void queryClient.invalidateQueries({ queryKey: ['cliente-pedidos'] })
    void queryClient.invalidateQueries({ queryKey: ['cliente-detail'] })
    if (leadId) void marcarGanado()
  }

  if (!leadId && !clienteId) return null

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        disabled={preparando}
        title="Cargar pedido"
        aria-label="Cargar pedido"
        className={cn(
          'group flex items-center gap-2 h-11 pl-3 pr-4 rounded-full shadow-lg shadow-primary/30',
          'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95',
          'transition-all duration-150 disabled:opacity-80 disabled:active:scale-100',
          className,
        )}
      >
        <span className="relative flex items-center justify-center w-6 h-6">
          {preparando ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <>
              <ShoppingCart size={18} />
              <Plus
                size={11}
                strokeWidth={3}
                className="absolute -top-1 -right-1.5 rounded-full bg-primary-foreground text-primary p-[1px]"
              />
            </>
          )}
        </span>
        <span className="text-sm font-semibold whitespace-nowrap">
          {preparando ? 'Preparando…' : 'Cargar pedido'}
        </span>
      </button>

      {abierto && clienteListo && (
        <CreatePedidoModal
          clienteId={clienteListo}
          onClose={() => setAbierto(false)}
          onPedidoCreado={onPedidoCreado}
        />
      )}
    </>
  )
}
