'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'

type Agent = { id: string; name: string | null }
type Rule = 'fixed' | 'random' | 'weighted' | 'round_robin'

type Config = {
  rule: Rule
  fixedAgentId: string | null
  weights: Array<{ agentId: string; weight: number }>
}

type Props = {
  initialConfig: Config | null
  agents: Agent[]
}

const RULE_LABELS: Record<Rule, string> = {
  fixed:       'Todo a un agente',
  random:      'Aleatorio',
  weighted:    'Ponderado',
  round_robin: 'Round-robin',
}

const RULE_DESCRIPTIONS: Record<Rule, string> = {
  fixed:       'Todos los leads van siempre al mismo agente.',
  random:      'Cada lead se asigna a un agente al azar con probabilidad uniforme.',
  weighted:    'Cada agente recibe un porcentaje del total. Los pesos deben sumar 100.',
  round_robin: 'Los leads se reparten en turno rotativo entre los agentes activos.',
}

export default function AssignmentConfigForm({ initialConfig, agents }: Props) {
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [rule, setRule] = useState<Rule>(initialConfig?.rule ?? 'round_robin')
  const [fixedAgentId, setFixedAgentId] = useState<string>(
    initialConfig?.fixedAgentId ?? agents[0]?.id ?? '',
  )
  const [weights, setWeights] = useState<Array<{ agentId: string; weight: string }>>(
    () => {
      if (initialConfig?.weights?.length) {
        return initialConfig.weights.map((w) => ({
          agentId: w.agentId,
          weight: String(w.weight),
        }))
      }
      return agents.map((a) => ({
        agentId: a.id,
        weight: agents.length > 0 ? String(Math.floor(100 / agents.length)) : '0',
      }))
    },
  )

  const weightTotal = weights.reduce((s, w) => s + (parseFloat(w.weight) || 0), 0)
  const weightOk = Math.abs(weightTotal - 100) <= 0.01

  function setWeightValue(idx: number, value: string) {
    setWeights((prev) => prev.map((w, i) => (i === idx ? { ...w, weight: value } : w)))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    if (rule === 'weighted' && !weightOk) {
      setError(`Los pesos deben sumar 100 (actual: ${weightTotal.toFixed(1)})`)
      return
    }

    const body: Record<string, unknown> = { rule }
    if (rule === 'fixed') {
      body['fixedAgentId'] = fixedAgentId
    }
    if (rule === 'weighted') {
      body['weights'] = weights.map((w) => ({
        agentId: w.agentId,
        weight: parseFloat(w.weight),
      }))
    }

    startTransition(async () => {
      const res = await fetch('/api/settings/assignment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json() as { error: string }
        setError(data.error ?? 'Error al guardar')
        return
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-md font-semibold mb-1">Regla de asignación de leads</h2>
        <p className="text-sm text-muted-foreground">
          Define cómo se asigna automáticamente un agente cuando el bot califica un lead.
          El cambio se aplica en la próxima asignación.
        </p>
      </div>

      {/* Rule selector */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">Regla activa</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(Object.keys(RULE_LABELS) as Rule[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => { setRule(r); setError(null) }}
              className={cn(
                'flex flex-col items-start text-left px-4 py-3 rounded-lg border transition-colors duration-100',
                rule === r
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
              )}
            >
              <span className="text-sm font-medium">{RULE_LABELS[r]}</span>
              <span className="text-xs mt-0.5 opacity-75">{RULE_DESCRIPTIONS[r]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Fixed: agent selector */}
      {rule === 'fixed' && (
        <div>
          <label className="block text-sm font-medium mb-1.5">Agente asignado</label>
          {agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay agentes activos. Activá al menos uno en el apartado Equipo.
            </p>
          ) : (
            <select
              value={fixedAgentId}
              onChange={(e) => setFixedAgentId(e.target.value)}
              className={cn(
                'w-full px-3 py-2 text-sm rounded-md border',
                'border-border bg-background text-foreground',
                'focus:outline-none focus:ring-1 focus:ring-ring',
              )}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name ?? a.id}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Weighted: per-agent rows */}
      {rule === 'weighted' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium">Pesos por agente (%)</label>
            <span
              className={cn(
                'text-xs font-mono tabular-nums',
                weightOk ? 'text-muted-foreground' : 'text-destructive',
              )}
            >
              Total: {weightTotal.toFixed(1)} / 100
            </span>
          </div>
          {agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay agentes activos.</p>
          ) : (
            <div className="space-y-2">
              {weights.map((w, idx) => {
                const agent = agents.find((a) => a.id === w.agentId)
                return (
                  <div key={w.agentId} className="flex items-center gap-3">
                    <span className="text-sm flex-1 truncate">{agent?.name ?? w.agentId}</span>
                    <div className="relative flex items-center">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={w.weight}
                        onChange={(e) => setWeightValue(idx, e.target.value)}
                        className={cn(
                          'w-24 px-3 py-1.5 text-sm rounded-md border pr-7 tabular-nums',
                          'border-border bg-background text-foreground',
                          'focus:outline-none focus:ring-1 focus:ring-ring',
                        )}
                      />
                      <span className="absolute right-2.5 text-xs text-muted-foreground">%</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {!weightOk && weights.length > 0 && (
            <p className="text-xs text-destructive mt-2">
              Los porcentajes deben sumar exactamente 100.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending || (rule === 'weighted' && !weightOk) || (rule === 'fixed' && !fixedAgentId)}
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-md',
            'bg-primary text-primary-foreground',
            'hover:bg-primary/90 transition-colors duration-100',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {isPending ? 'Guardando...' : 'Guardar cambios'}
        </button>
        {saved && <span className="text-sm text-muted-foreground">Guardado.</span>}
      </div>
    </form>
  )
}
