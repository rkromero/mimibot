'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, CheckCheck, AlertCircle, Clock, MessageSquareReply, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatFechaHoraAR } from '@/lib/dates'
import { nombreLead } from '@/lib/clientes/nombre'
import { useToast } from '@/components/shared/ToastProvider'
import type { EnvioDetalle, DestinatarioDetalle } from '@/lib/envios-masivos/detalle'
import { ESTADO_ENVIO } from './EnviosMasivosView'

function Tilde({ d }: { d: DestinatarioDetalle }) {
  if (d.estado !== 'enviado') return null
  if (d.waStatus === 'failed') return <AlertCircle size={13} className="text-destructive" aria-label="No entregado" />
  if (d.waStatus === 'read') return <CheckCheck size={13} className="text-sky-500" aria-label="Leído" />
  if (d.waStatus === 'delivered') return <CheckCheck size={13} aria-label="Entregado" />
  return <Check size={13} aria-label="Enviado" />
}

const ESTADO_DEST: Record<DestinatarioDetalle['estado'], string> = {
  pendiente: 'Pendiente',
  enviado: 'Enviado',
  fallido: 'Falló',
  omitido: 'Omitido',
  cancelado: 'Cancelado',
}

/** Detalle de un envío: resumen, texto de la plantilla y cada destinatario con tildes y respuesta. */
export default function EnvioDetalleView({ id }: { id: string }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [cancelando, setCancelando] = useState(false)
  const [filtro, setFiltro] = useState<'todos' | 'respondieron' | 'fallidos' | 'omitidos'>('todos')

  const { data, isLoading } = useQuery<EnvioDetalle>({
    queryKey: ['envio-masivo', id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/envios-masivos/${id}`)
      const json = await res.json() as { data?: EnvioDetalle; error?: string }
      if (!res.ok || !json.data) throw new Error(json.error ?? 'No se pudo cargar el envío')
      return json.data
    },
    refetchInterval: (q) => (q.state.data?.estado === 'enviando' ? 4_000 : 30_000),
  })

  async function cancelar() {
    if (!data) return
    setCancelando(true)
    try {
      const res = await fetch(`/api/admin/envios-masivos/${id}`, { method: 'DELETE' })
      const json = await res.json() as { data?: { cancelados: number }; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'No se pudo cancelar')
      toast.success(`Envío cancelado: ${json.data?.cancelados ?? 0} mensajes no van a salir`)
      void queryClient.invalidateQueries({ queryKey: ['envio-masivo', id] })
      void queryClient.invalidateQueries({ queryKey: ['envios-masivos'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cancelar')
    } finally {
      setCancelando(false)
    }
  }

  if (isLoading || !data) {
    return <div className="p-6"><div className="h-40 rounded-lg bg-muted animate-pulse" /></div>
  }

  const pendientes = data.destinatarios.filter((d) => d.estado === 'pendiente').length
  const lista = data.destinatarios.filter((d) =>
    filtro === 'todos' ? true
    : filtro === 'respondieron' ? d.respondio
    : filtro === 'fallidos' ? d.estado === 'fallido' || d.waStatus === 'failed'
    : d.estado === 'omitido' || d.estado === 'cancelado')

  const cifras = [
    { label: 'Enviados', valor: data.enviados },
    { label: 'Entregados', valor: data.entregados },
    { label: 'Leídos', valor: data.leidos },
    { label: 'Respondieron', valor: data.respondieron },
    { label: 'Fallidos', valor: data.fallidos },
    { label: 'Omitidos', valor: data.omitidos },
  ]

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="p-4 md:p-6 pb-24 md:pb-6 max-w-5xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <Link href="/admin/envios-masivos" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft size={12} /> Envíos masivos</Link>
            <h1 className="text-xl font-semibold text-foreground mt-1 flex items-center gap-2 flex-wrap">
              {data.nombre}
              <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium', ESTADO_ENVIO[data.estado].clase)}>{ESTADO_ENVIO[data.estado].label}</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Plantilla <span className="font-mono">{data.templateName}</span> · {data.estado === 'programado' ? 'sale' : 'programado para'} {formatFechaHoraAR(data.programadoAt)}
              {data.creadoPorNombre && ` · por ${data.creadoPorNombre}`}
              {pendientes > 0 && ` · ${pendientes} pendientes`}
            </p>
          </div>
          {(data.estado === 'programado' || data.estado === 'enviando') && (
            <button type="button" onClick={() => void cancelar()} disabled={cancelando} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-50">
              <XCircle size={14} /> {cancelando ? 'Cancelando…' : 'Cancelar envío'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {cifras.map((c) => (
            <div key={c.label} className="bg-card border border-border rounded-lg p-3">
              <p className="text-[11px] text-muted-foreground">{c.label}</p>
              <p className="text-xl font-bold tabular-nums">{c.valor}</p>
            </div>
          ))}
        </div>

        <div className="bg-muted/40 border border-border rounded-lg p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Texto de la plantilla</p>
          <p className="text-sm whitespace-pre-wrap">{data.templateBody}</p>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border overflow-x-auto">
            {([['todos', 'Todos'], ['respondieron', 'Respondieron'], ['fallidos', 'Fallidos'], ['omitidos', 'Omitidos']] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setFiltro(k)} className={cn('px-2.5 py-1 rounded-full text-xs font-medium shrink-0', filtro === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}>{label}</button>
            ))}
          </div>
          <ul className="divide-y divide-border">
            {lista.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Nada para mostrar.</li>}
            {lista.map((d) => {
              const n = nombreLead(d.nombre, d.empresa)
              const abrir = d.conversationId ? `/inbox?conversation=${d.conversationId}` : `/pipeline?lead=${d.leadId}`
              return (
                <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="flex-1 min-w-0">
                    <Link href={abrir} className="font-medium hover:underline truncate block">{n.principal}</Link>
                    <p className="text-xs text-muted-foreground truncate">
                      {n.secundario ? `${n.secundario} · ` : ''}{d.etapa ?? '—'}
                      {d.motivo && <span className="text-amber-700 dark:text-amber-300"> · {d.motivo}</span>}
                    </p>
                  </div>
                  {d.respondio && <span className="inline-flex items-center gap-1 text-[11px] text-green-700 dark:text-green-300 shrink-0"><MessageSquareReply size={12} /> respondió</span>}
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 tabular-nums">
                    {d.estado === 'pendiente' && <Clock size={12} />}
                    {ESTADO_DEST[d.estado]}
                    {d.enviadoAt && ` · ${formatFechaHoraAR(d.enviadoAt, true)}`}
                    <Tilde d={d} />
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
