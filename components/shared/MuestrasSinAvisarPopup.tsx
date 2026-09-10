'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Truck, X, ImageOff } from 'lucide-react'
import { cn, formatPhone } from '@/lib/utils'
import { formatFechaInstanteAR } from '@/lib/dates'
import { claveMuestrasPopupVisto, type MuestraPendienteAviso } from '@/lib/leads/muestra-aviso'
import { useToast } from '@/components/shared/ToastProvider'
import LeadPanel from '@/components/lead/LeadPanel'
import type { Session } from 'next-auth'

const ROLES_CON_LEADS = new Set(['admin', 'gerente', 'agent', 'vendedor', 'rtv'])

type EventoMuestra =
  | { type: 'muestra_despachada'; leadId: string; contactName: string; conFoto: boolean }
  | { type: 'muestra_avisada'; leadId: string }
  | { type: string }

/**
 * "Salió una muestra, avisale al cliente": dos cosas en una.
 *
 * - Toast en tiempo real cuando fábrica marca entregada una muestra (evento
 *   `muestra_despachada` del stream SSE), para el vendedor y los admins.
 * - Popup al abrir el sistema con las muestras entregadas a las que todavía
 *   no se les avisó (una vez por sesión del navegador; vuelve a aparecer si
 *   entra una nueva). Cada lead se abre en su panel, donde está el botón
 *   "Avisar que salió la muestra".
 */
export default function MuestrasSinAvisarPopup({ user }: { user: Session['user'] }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  // useToast devuelve un objeto nuevo en cada render: la referencia evita
  // reabrir el stream SSE a cada rato
  const toastRef = useRef(toast)
  toastRef.current = toast
  const habilitado = ROLES_CON_LEADS.has(user.role)
  const clave = claveMuestrasPopupVisto(user.id)
  // Arranca como "visto" para no parpadear antes de leer sessionStorage
  const [visto, setVisto] = useState(true)
  const [leadAbierto, setLeadAbierto] = useState<string | null>(null)

  useEffect(() => {
    if (!habilitado) return
    try {
      setVisto(sessionStorage.getItem(clave) === '1')
    } catch {
      setVisto(false)
    }
  }, [habilitado, clave])

  const { data } = useQuery<MuestraPendienteAviso[]>({
    queryKey: ['muestras-sin-avisar'],
    queryFn: async () => {
      const res = await fetch('/api/leads/muestras-pendientes')
      if (!res.ok) return []
      const json = await res.json() as { data: MuestraPendienteAviso[] }
      return json.data
    },
    enabled: habilitado,
    staleTime: 60_000,
  })

  // Tiempo real: toast al entregarse una muestra y refresco de la lista
  useEffect(() => {
    if (!habilitado) return
    const es = new EventSource('/api/realtime/stream')
    es.onmessage = (e) => {
      let evento: EventoMuestra
      try {
        evento = JSON.parse(e.data as string) as EventoMuestra
      } catch {
        return
      }
      if (evento.type === 'muestra_despachada') {
        const ev = evento as Extract<EventoMuestra, { type: 'muestra_despachada' }>
        const nombre = ev.contactName || 'un lead'
        toastRef.current.info(
          ev.conFoto
            ? `Salió la muestra de ${nombre}. Avisale al cliente con la guía desde el lead.`
            : `Se entregó la muestra de ${nombre}.`,
          8000,
        )
        void queryClient.invalidateQueries({ queryKey: ['muestras-sin-avisar'] })
        void queryClient.invalidateQueries({ queryKey: ['dashboard-hoy'] })
        // Que el popup vuelva a aparecer con la nueva
        try {
          sessionStorage.removeItem(clave)
        } catch {
          // sin sessionStorage
        }
        setVisto(false)
      } else if (evento.type === 'muestra_avisada') {
        void queryClient.invalidateQueries({ queryKey: ['muestras-sin-avisar'] })
        void queryClient.invalidateQueries({ queryKey: ['dashboard-hoy'] })
      }
    }
    es.onerror = () => {}
    return () => es.close()
  }, [habilitado, queryClient, clave])

  function cerrar() {
    try {
      sessionStorage.setItem(clave, '1')
    } catch {
      // Sin sessionStorage (modo privado): se vuelve a mostrar en la próxima carga
    }
    setVisto(true)
  }

  const items = data ?? []
  // Mientras hay un lead abierto el popup se oculta: el panel del lead va debajo del z-50
  const mostrar = habilitado && !visto && items.length > 0 && !leadAbierto

  return (
    <>
      {mostrar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={cerrar}>
          <div
            className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="muestras-sin-avisar-titulo"
          >
            <div className="flex items-start gap-3 p-5 pb-3">
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                <Truck size={18} />
              </span>
              <div className="flex-1 min-w-0">
                <h2 id="muestras-sin-avisar-titulo" className="text-base font-semibold text-foreground">
                  {items.length === 1 ? 'Salió una muestra: avisale al cliente' : `Salieron ${items.length} muestras: avisá a los clientes`}
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Fábrica ya las despachó. Desde el lead se manda la plantilla con la guía de envío.
                </p>
              </div>
              <button
                type="button"
                onClick={cerrar}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>

            <ul className="flex-1 overflow-y-auto divide-y divide-border border-t border-border">
              {items.map((m) => (
                <li key={m.leadId} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-foreground truncate">{m.nombre}</span>
                      <span
                        className={cn(
                          'shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium',
                          'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
                        )}
                      >
                        <Truck size={11} />
                        {formatFechaInstanteAR(m.entregadaAt, true)}
                      </span>
                      {!m.conFoto && (
                        <span
                          className="shrink-0 inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                          title="El pedido no tiene la foto de la guía: no hay nada para adjuntar"
                        >
                          <ImageOff size={11} />
                          sin guía
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {m.expresoNombre ? `Por ${m.expresoNombre}` : 'Sin expreso'}
                      {m.telefono && ` · ${formatPhone(m.telefono)}`}
                      {m.etapa && ` · ${m.etapa}`}
                      {m.asignadoNombre && m.asignadoNombre !== user.name && ` · ${m.asignadoNombre}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLeadAbierto(m.leadId)}
                    className="shrink-0 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border text-foreground hover:bg-accent transition-colors"
                  >
                    Abrir
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between gap-2 p-4 border-t border-border">
              <Link
                href="/pipeline?muestra=sin_avisar"
                onClick={cerrar}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Ver en el pipeline
              </Link>
              <button
                type="button"
                onClick={cerrar}
                className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {leadAbierto && (
        <LeadPanel
          leadId={leadAbierto}
          user={user}
          onClose={() => {
            setLeadAbierto(null)
            void queryClient.invalidateQueries({ queryKey: ['muestras-sin-avisar'] })
          }}
        />
      )}
    </>
  )
}
