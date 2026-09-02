'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, PhoneCall, X } from 'lucide-react'
import { cn, formatPhone } from '@/lib/utils'
import { todayStrAR, formatFechaAR } from '@/lib/dates'
import { clavePopupVisto, type RecordatorioHoy } from '@/lib/leads/recordatorio'
import LeadPanel from '@/components/lead/LeadPanel'
import type { Session } from 'next-auth'

const ROLES_CON_LEADS = new Set(['admin', 'gerente', 'agent', 'vendedor', 'rtv'])

/**
 * Popup "Tenés que llamar a estos hoy": al abrir el sistema, si el usuario
 * tiene recordatorios de llamada de hoy o vencidos, se lo muestra una vez
 * por día (marca en localStorage). Cada lead se abre en su panel sin salir
 * de la pantalla actual; el popup vuelve al cerrar el panel y se va recién
 * cuando el usuario lo cierra.
 */
export default function RecordatoriosHoyPopup({ user }: { user: Session['user'] }) {
  const queryClient = useQueryClient()
  const habilitado = ROLES_CON_LEADS.has(user.role)
  const hoy = todayStrAR()
  const clave = clavePopupVisto(user.id, hoy)
  // Arranca como "visto" para no parpadear antes de leer localStorage
  const [visto, setVisto] = useState(true)
  const [leadAbierto, setLeadAbierto] = useState<string | null>(null)

  useEffect(() => {
    if (!habilitado) return
    try {
      setVisto(localStorage.getItem(clave) === '1')
    } catch {
      setVisto(false)
    }
  }, [habilitado, clave])

  const { data } = useQuery<RecordatorioHoy[]>({
    queryKey: ['recordatorios-hoy'],
    queryFn: async () => {
      const res = await fetch('/api/leads/recordatorios')
      if (!res.ok) return []
      const json = await res.json() as { data: RecordatorioHoy[] }
      return json.data
    },
    enabled: habilitado && !visto,
    staleTime: 60_000,
  })

  function cerrar() {
    try {
      localStorage.setItem(clave, '1')
    } catch {
      // Sin localStorage (modo privado): se vuelve a mostrar en la próxima carga
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
            aria-labelledby="recordatorios-hoy-titulo"
          >
            <div className="flex items-start gap-3 p-5 pb-3">
              <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                <PhoneCall size={18} />
              </span>
              <div className="flex-1 min-w-0">
                <h2 id="recordatorios-hoy-titulo" className="text-base font-semibold text-foreground">
                  {items.length === 1 ? 'Tenés que llamar a este lead hoy' : `Tenés que llamar a ${items.length} leads hoy`}
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Recordatorios de hoy y los que quedaron vencidos.
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
              {items.map((r) => (
                <li key={r.leadId} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-foreground truncate">{r.nombre}</span>
                      <span
                        className={cn(
                          'shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium',
                          r.vencido
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
                        )}
                      >
                        <CalendarClock size={11} />
                        {r.vencido ? `Vencido ${formatFechaAR(r.fecha, true)}` : 'Hoy'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {r.nota ?? 'Sin nota'}
                      {r.telefono && ` · ${formatPhone(r.telefono)}`}
                      {r.etapa && ` · ${r.etapa}`}
                      {r.asignadoNombre && r.asignadoNombre !== user.name && ` · ${r.asignadoNombre}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLeadAbierto(r.leadId)}
                    className="shrink-0 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border text-foreground hover:bg-accent transition-colors"
                  >
                    Abrir
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between gap-2 p-4 border-t border-border">
              <Link
                href="/pipeline?recordatorio=hoy"
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
            void queryClient.invalidateQueries({ queryKey: ['recordatorios-hoy'] })
          }}
        />
      )}
    </>
  )
}
