'use client'

import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import type { LeadWithContact, PipelineStage } from '@/types/db'

type Props = {
  leads: LeadWithContact[]
  stages: PipelineStage[]
  loading: boolean
  onLeadClick: (id: string) => void
}

const sourceLabels: Record<string, string> = {
  manual: 'Manual',
  whatsapp: 'WhatsApp',
  landing: 'Landing',
}

const sourceColors: Record<string, string> = {
  manual: 'bg-muted text-muted-foreground',
  whatsapp: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  landing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
}

function relativeContact(date: Date | null | undefined): string {
  if (!date) return 'Sin contacto'
  return formatDistanceToNow(date, { addSuffix: true, locale: es })
}

export default function LeadList({ leads, stages, loading, onLeadClick }: Props) {
  if (loading) {
    return (
      <div className="flex-1 p-4 space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 bg-muted/40 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (leads.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground py-12">
        No hay leads en esta etapa
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      {/* Mobile card view */}
      <div className="md:hidden divide-y divide-border">
        {leads.map((lead) => {
          const stage = stages.find((s) => s.id === lead.stageId) ?? lead.stage
          const lastContact = lead.lastContactedAt ? new Date(lead.lastContactedAt) : null
          const preview = lead.lastMessage?.body?.slice(0, 60) ?? null
          return (
            <button
              key={lead.id}
              onClick={() => onLeadClick(lead.id)}
              className={cn(
                'w-full flex items-start gap-3 px-4 py-4 text-left active:bg-accent/60 transition-colors',
                lead.unreadCount > 0 && 'border-l-[3px] border-l-primary',
              )}
            >
              {/* Stage color dot */}
              <span
                className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: stage?.color ?? '#94a3b8' }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={cn(
                    'text-base truncate',
                    lead.unreadCount > 0 ? 'font-semibold text-foreground' : 'font-medium text-foreground',
                  )}>
                    {lead.contact.name}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {lead.unreadCount > 0 && (
                      <span className="text-[10px] font-bold text-primary-foreground bg-primary rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center tabular-nums">
                        {lead.unreadCount}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {lastContact ? relativeContact(lastContact) : '—'}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{stage?.name ?? '—'}</p>
                {preview && (
                  <p className="text-xs text-muted-foreground mt-1 truncate">{preview}</p>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Desktop table view */}
      <table className="hidden md:table w-full text-sm">
        <thead className="sticky top-0 bg-background z-10 border-b border-border">
          <tr>
            <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Nombre</th>
            <th className="text-left py-2.5 px-3 font-medium text-muted-foreground hidden sm:table-cell">Teléfono</th>
            <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Etapa</th>
            <th className="text-left py-2.5 px-3 font-medium text-muted-foreground hidden md:table-cell">Agente</th>
            <th className="text-left py-2.5 px-3 font-medium text-muted-foreground hidden lg:table-cell">Fuente</th>
            <th className="text-left py-2.5 px-3 font-medium text-muted-foreground hidden lg:table-cell">Fecha</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => {
            const stage = stages.find((s) => s.id === lead.stageId)
            return (
              <tr
                key={lead.id}
                onClick={() => onLeadClick(lead.id)}
                className="border-b border-border last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
              >
                <td className="py-2.5 px-3 font-medium text-foreground">{lead.contact.name}</td>
                <td className="py-2.5 px-3 text-muted-foreground hidden sm:table-cell">
                  {lead.contact.phone ?? '—'}
                </td>
                <td className="py-2.5 px-3">
                  <span className="flex items-center gap-1.5">
                    {stage && (
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: stage.color ?? '#94a3b8' }}
                      />
                    )}
                    <span className="text-muted-foreground text-xs">{stage?.name ?? '—'}</span>
                  </span>
                </td>
                <td className="py-2.5 px-3 text-muted-foreground hidden md:table-cell">
                  {lead.assignedUser?.name ?? '—'}
                </td>
                <td className="py-2.5 px-3 hidden lg:table-cell">
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', sourceColors[lead.source] ?? sourceColors['manual'])}>
                    {sourceLabels[lead.source] ?? lead.source}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-muted-foreground text-xs hidden lg:table-cell">
                  {lead.createdAt ? format(new Date(lead.createdAt), 'dd/MM/yy') : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
