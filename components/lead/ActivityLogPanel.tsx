'use client'

import { useQuery } from '@tanstack/react-query'
import { relativeTime } from '@/lib/utils'
import type { ActivityLog } from '@/types/db'

const ACTION_LABELS: Record<string, string> = {
  stage_changed: 'Cambió de etapa',
  assigned: 'Asignado',
  unassigned: 'Desasignado',
  note_added: 'Nota agregada',
  bot_handoff: 'Bot hizo handoff',
  bot_enabled: 'Bot activado',
  bot_disabled: 'Bot desactivado',
  lead_created: 'Lead creado',
  tag_added: 'Tag agregado',
  tag_removed: 'Tag eliminado',
}

export default function ActivityLogPanel({ leadId }: { leadId: string }) {
  const { data: log } = useQuery({
    queryKey: ['activity', leadId],
    queryFn: async () => {
      const res = await fetch(`/api/leads/${leadId}/activity`)
      if (!res.ok) return []
      const json = await res.json() as { data: ActivityLog[] }
      return json.data
    },
    staleTime: 30_000,
  })

  if (!log?.length) return null

  return (
    <div className="mb-4">
      <div className="px-4 py-1.5">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Actividad
        </span>
      </div>
      <div className="px-4 space-y-2">
        {log.map((entry) => (
          <div key={entry.id} className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700 mt-1.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground">{ACTION_LABELS[entry.action] ?? entry.action}</p>
              <p className="text-xs text-muted-foreground">{relativeTime(entry.createdAt)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
