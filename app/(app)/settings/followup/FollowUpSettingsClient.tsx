'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { FollowUpConfig, FollowUpTemplate } from '@/types/db'
import FollowUpConfigForm from './FollowUpConfigForm'
import TemplateList from './TemplateList'

type Tab = 'config' | 'templates'

type Props = {
  initialConfig: FollowUpConfig | null
  initialTemplates: FollowUpTemplate[]
}

export default function FollowUpSettingsClient({ initialConfig, initialTemplates }: Props) {
  const [tab, setTab] = useState<Tab>('config')
  const [templates, setTemplates] = useState(initialTemplates)

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Seguimiento inteligente</h1>
        <p className="text-sm text-muted-foreground mt-1">
          El sistema detecta cuando un lead se enfría y envía mensajes de seguimiento automáticos para recuperar el interés.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {([['config', 'Configuración'], ['templates', 'Templates WhatsApp']] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors',
              tab === t
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'config' && <FollowUpConfigForm initialConfig={initialConfig} />}
      {tab === 'templates' && <TemplateList templates={templates} onTemplatesChange={setTemplates} />}
    </div>
  )
}
