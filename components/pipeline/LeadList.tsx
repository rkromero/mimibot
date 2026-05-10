'use client'

import { format } from 'date-fns'
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

export default function LeadList({ leads, stages, loading, onLeadClick }: Props) {
  if (loading) {
    return (
      <div className="flex-1 p-4 space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 bg-muted/40 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  if (leads.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        No hay leads
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-sm">
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
