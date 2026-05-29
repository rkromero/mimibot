'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  type MetaRow,
  type User,
  type MetaFormValues,
  type MetaFormValuesAgent,
  type MetaFormValuesVendedor,
  initAgentValues,
  initVendedorValues,
} from './MetaFormRow'

type Props = {
  vendedor: User
  meta: MetaRow | null
  onSave: (values: MetaFormValues) => Promise<void>
  isSaving: boolean
  isLocked: boolean
}

export default function MetaMobileCard({ vendedor, meta, onSave, isSaving, isLocked }: Props) {
  const isVendedor = vendedor.role === 'vendedor'

  const [agentValues, setAgentValues] = useState<MetaFormValuesAgent>(() => initAgentValues(meta))
  const [agentSaved, setAgentSaved] = useState<MetaFormValuesAgent>(() => initAgentValues(meta))
  const [vendedorValues, setVendedorValues] = useState<MetaFormValuesVendedor>(() => initVendedorValues(meta))
  const [vendedorSaved, setVendedorSaved] = useState<MetaFormValuesVendedor>(() => initVendedorValues(meta))

  useEffect(() => {
    if (isVendedor) {
      const fresh = initVendedorValues(meta)
      setVendedorValues(fresh)
      setVendedorSaved(fresh)
    } else {
      const fresh = initAgentValues(meta)
      setAgentValues(fresh)
      setAgentSaved(fresh)
    }
  }, [meta, isVendedor])

  const isDirty = isVendedor
    ? (
        vendedorValues.clientesNuevosObjetivo !== vendedorSaved.clientesNuevosObjetivo ||
        vendedorValues.pctClientesConPedidoObjetivo !== vendedorSaved.pctClientesConPedidoObjetivo ||
        vendedorValues.pctCobranzaObjetivo !== vendedorSaved.pctCobranzaObjetivo
      )
    : (
        agentValues.clientesNuevosObjetivo !== agentSaved.clientesNuevosObjetivo ||
        agentValues.conversionLeadsObjetivo !== agentSaved.conversionLeadsObjetivo ||
        agentValues.pctClientesConPedidoObjetivo !== agentSaved.pctClientesConPedidoObjetivo ||
        agentValues.pctPedidosPagadosObjetivo !== agentSaved.pctPedidosPagadosObjetivo ||
        agentValues.pctCobranzaObjetivo !== agentSaved.pctCobranzaObjetivo
      )

  function handleAgent(field: keyof MetaFormValuesAgent, raw: string) {
    if (field === 'clientesNuevosObjetivo') {
      const n = parseInt(raw, 10)
      setAgentValues((p) => ({ ...p, [field]: isNaN(n) ? 0 : n }))
    } else {
      setAgentValues((p) => ({ ...p, [field]: raw }))
    }
  }

  function handleVendedor(field: keyof MetaFormValuesVendedor, raw: string) {
    if (field === 'clientesNuevosObjetivo') {
      const n = parseInt(raw, 10)
      setVendedorValues((p) => ({ ...p, [field]: isNaN(n) ? 0 : n }))
    } else {
      setVendedorValues((p) => ({ ...p, [field]: raw }))
    }
  }

  async function handleSave() {
    if (isVendedor) {
      await onSave(vendedorValues)
      setVendedorSaved(vendedorValues)
    } else {
      await onSave(agentValues)
      setAgentSaved(agentValues)
    }
  }

  const hasMeta = meta !== null
  const avatarColor = vendedor.avatarColor ?? '#6b7280'
  const initial = (vendedor.name[0] ?? '?').toUpperCase()

  // Touch-friendly input: min 44px height via py-3
  const inp = 'w-full border border-border rounded-lg px-3 py-3 text-[16px] bg-background focus:outline-none focus:ring-2 focus:ring-ring'
  const roVal = (v: string | number) => (
    <span className="text-sm text-muted-foreground">{v}</span>
  )

  return (
    <div className={cn(
      'rounded-xl border border-border bg-card shadow-sm overflow-hidden',
      isVendedor
        ? 'border-l-4 border-l-purple-400 dark:border-l-purple-600'
        : 'border-l-4 border-l-blue-400 dark:border-l-blue-600',
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2.5">
          <span
            className="w-9 h-9 rounded-full inline-flex items-center justify-center text-white text-sm font-semibold shrink-0"
            style={{ backgroundColor: avatarColor }}
          >
            {initial}
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">{vendedor.name}</p>
            <span className={cn(
              'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
              isVendedor
                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
            )}>
              {isVendedor ? 'Vendedor' : 'Agente'}
            </span>
          </div>
        </div>
        <span className={cn(
          'px-2 py-0.5 rounded-full text-xs font-medium',
          hasMeta
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
        )}>
          {hasMeta ? 'Cargada' : 'Pendiente'}
        </span>
      </div>

      {/* Fields */}
      <div className="px-4 py-3 space-y-3">
        {isVendedor ? (
          <>
            <Field label="Clientes Nuevos c/PP">
              {isLocked
                ? roVal(meta?.clientesNuevosObjetivo ?? '—')
                : <input type="number" min={0} value={vendedorValues.clientesNuevosObjetivo}
                    onChange={(e) => handleVendedor('clientesNuevosObjetivo', e.target.value)}
                    className={inp} />}
            </Field>
            <Field label="% Cobertura Cartera">
              {isLocked
                ? roVal(meta ? `${parseFloat(meta.pctClientesConPedidoObjetivo).toFixed(1)}%` : '—')
                : <input type="number" min={0} max={100} step="0.5" value={vendedorValues.pctClientesConPedidoObjetivo}
                    onChange={(e) => handleVendedor('pctClientesConPedidoObjetivo', e.target.value)}
                    className={inp} />}
            </Field>
            <Field label="% Cobranza">
              {isLocked
                ? roVal(meta ? `${parseFloat(meta.pctCobranzaObjetivo).toFixed(1)}%` : '—')
                : <input type="number" min={0} max={100} step="0.5" value={vendedorValues.pctCobranzaObjetivo}
                    onChange={(e) => handleVendedor('pctCobranzaObjetivo', e.target.value)}
                    className={inp} />}
            </Field>
          </>
        ) : (
          <>
            <Field label="Clientes Nuevos">
              {isLocked
                ? roVal(meta?.clientesNuevosObjetivo ?? '—')
                : <input type="number" min={0} value={agentValues.clientesNuevosObjetivo}
                    onChange={(e) => handleAgent('clientesNuevosObjetivo', e.target.value)}
                    className={inp} />}
            </Field>
            <Field label="Conversión Leads (%)">
              {isLocked
                ? roVal(meta ? `${parseFloat(meta.conversionLeadsObjetivo).toFixed(1)}%` : '—')
                : <input type="number" min={0} max={100} step="0.5" value={agentValues.conversionLeadsObjetivo}
                    onChange={(e) => handleAgent('conversionLeadsObjetivo', e.target.value)}
                    className={inp} />}
            </Field>
            <Field label="% Cobertura Cartera">
              {isLocked
                ? roVal(meta ? `${parseFloat(meta.pctClientesConPedidoObjetivo).toFixed(1)}%` : '—')
                : <input type="number" min={0} max={100} step="0.5" value={agentValues.pctClientesConPedidoObjetivo}
                    onChange={(e) => handleAgent('pctClientesConPedidoObjetivo', e.target.value)}
                    className={inp} />}
            </Field>
            <Field label="% Pedidos Pagados">
              {isLocked
                ? roVal(meta ? `${parseFloat(meta.pctPedidosPagadosObjetivo).toFixed(1)}%` : '—')
                : <input type="number" min={0} max={100} step="0.5" value={agentValues.pctPedidosPagadosObjetivo}
                    onChange={(e) => handleAgent('pctPedidosPagadosObjetivo', e.target.value)}
                    className={inp} />}
            </Field>
            <Field label="% Cobranza">
              {isLocked
                ? roVal(meta ? `${parseFloat(meta.pctCobranzaObjetivo).toFixed(1)}%` : '—')
                : <input type="number" min={0} max={100} step="0.5" value={agentValues.pctCobranzaObjetivo}
                    onChange={(e) => handleAgent('pctCobranzaObjetivo', e.target.value)}
                    className={inp} />}
            </Field>
          </>
        )}
      </div>

      {/* Save button */}
      {!isLocked && isDirty && (
        <div className="px-4 pb-4">
          <button
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="w-full py-3 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Guardando...' : 'Guardar meta'}
          </button>
        </div>
      )}
    </div>
  )
}

// Simple label + content wrapper
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  )
}
