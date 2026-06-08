'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type MetaRow = {
  id: string
  vendedorId: string
  vendedorNombre?: string
  periodoAnio: number
  periodoMes: number
  clientesNuevosObjetivo: number
  pedidosObjetivo: number
  montoCobradoObjetivo: string
  conversionLeadsObjetivo: string
  pctClientesConPedidoObjetivo: string
  pctPedidosPagadosObjetivo: string
  pctCobranzaObjetivo: string
  fechaCreacion: string
  fechaActualizacion: string
}

export type User = {
  id: string
  name: string
  email: string
  role: string
  avatarColor: string | null
  isActive?: boolean
}

export type MetaFormValuesAgent = {
  clientesNuevosObjetivo: number
  conversionLeadsObjetivo: string
  pctClientesConPedidoObjetivo: string
  pctPedidosPagadosObjetivo: string
  pctCobranzaObjetivo: string
}

export type MetaFormValuesVendedor = {
  clientesNuevosObjetivo: number
  pedidosObjetivo: number
  pctClientesConPedidoObjetivo: string
  pctCobranzaObjetivo: string
}

export type MetaFormValues = MetaFormValuesAgent | MetaFormValuesVendedor

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function initAgentValues(meta: MetaRow | null): MetaFormValuesAgent {
  return {
    clientesNuevosObjetivo: meta?.clientesNuevosObjetivo ?? 0,
    conversionLeadsObjetivo: meta?.conversionLeadsObjetivo ?? '0',
    pctClientesConPedidoObjetivo: meta?.pctClientesConPedidoObjetivo ?? '0',
    pctPedidosPagadosObjetivo: meta?.pctPedidosPagadosObjetivo ?? '0',
    pctCobranzaObjetivo: meta?.pctCobranzaObjetivo ?? '0',
  }
}

export function initVendedorValues(meta: MetaRow | null): MetaFormValuesVendedor {
  return {
    clientesNuevosObjetivo: meta?.clientesNuevosObjetivo ?? 0,
    pedidosObjetivo: meta?.pedidosObjetivo ?? 0,
    pctClientesConPedidoObjetivo: meta?.pctClientesConPedidoObjetivo ?? '0',
    pctCobranzaObjetivo: meta?.pctCobranzaObjetivo ?? '0',
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Cell showing "—" for columns not applicable to this row's role */
function DisabledCell({ agentCol = true }: { agentCol?: boolean }) {
  return (
    <td className={cn(
      'py-2.5 px-3',
      agentCol
        ? 'bg-blue-50/30 dark:bg-blue-950/20'
        : 'bg-purple-50/30 dark:bg-purple-950/20',
    )}>
      <span className="text-sm text-muted-foreground/40 select-none">—</span>
    </td>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  vendedor: User
  meta: MetaRow | null
  periodoAnio: number
  periodoMes: number
  onSave: (values: MetaFormValues) => Promise<void>
  isSaving: boolean
  isLocked: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MetaFormRow({ vendedor, meta, onSave, isSaving, isLocked }: Props) {
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
        vendedorValues.pedidosObjetivo !== vendedorSaved.pedidosObjetivo ||
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
    if (field === 'clientesNuevosObjetivo' || field === 'pedidosObjetivo') {
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

  const inp = 'w-full border border-border rounded px-2 py-3 md:py-1.5 text-[16px] md:text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring'
  const ro = 'text-sm text-muted-foreground'
  const fmt = (v: string) =>
    `$${parseFloat(v).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`
  const fmtPct = (v: string) => `${parseFloat(v).toFixed(1)}%`

  return (
    <tr className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors">
      {/* ── Name + role chip ── */}
      <td className="py-2.5 px-3 sticky left-0 bg-card z-10">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-7 h-7 rounded-full inline-flex items-center justify-center text-white text-xs font-semibold shrink-0"
            style={{ backgroundColor: avatarColor }}
          >
            {initial}
          </span>
          <div className="min-w-0">
            <span className="text-sm font-medium text-foreground truncate block max-w-[110px]">
              {vendedor.name}
            </span>
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
      </td>

      {/* ══ AGENT COLUMNS (cols 2-6) ══ */}

      {/* Agent: Clientes Nuevos */}
      {isVendedor ? <DisabledCell agentCol /> : (
        <td className="py-2.5 px-3 bg-blue-50/20 dark:bg-blue-950/10">
          {isLocked
            ? <span className={ro}>{meta?.clientesNuevosObjetivo ?? '—'}</span>
            : <input type="number" min={0} value={agentValues.clientesNuevosObjetivo}
                onChange={(e) => handleAgent('clientesNuevosObjetivo', e.target.value)}
                className={inp} />}
        </td>
      )}

      {/* Agent: Conversión Leads */}
      {isVendedor ? <DisabledCell agentCol /> : (
        <td className="py-2.5 px-3 bg-blue-50/20 dark:bg-blue-950/10">
          {isLocked
            ? <span className={ro}>{meta ? fmtPct(meta.conversionLeadsObjetivo) : '—'}</span>
            : <input type="number" min={0} max={100} step="0.5" value={agentValues.conversionLeadsObjetivo}
                onChange={(e) => handleAgent('conversionLeadsObjetivo', e.target.value)}
                className={inp} />}
        </td>
      )}

      {/* Agent: % Cobertura Cartera */}
      {isVendedor ? <DisabledCell agentCol /> : (
        <td className="py-2.5 px-3 bg-blue-50/20 dark:bg-blue-950/10">
          {isLocked
            ? <span className={ro}>{meta ? fmtPct(meta.pctClientesConPedidoObjetivo) : '—'}</span>
            : <input type="number" min={0} max={100} step="0.5" value={agentValues.pctClientesConPedidoObjetivo}
                onChange={(e) => handleAgent('pctClientesConPedidoObjetivo', e.target.value)}
                className={inp} />}
        </td>
      )}

      {/* Agent: % Pedidos Pagados */}
      {isVendedor ? <DisabledCell agentCol /> : (
        <td className="py-2.5 px-3 bg-blue-50/20 dark:bg-blue-950/10">
          {isLocked
            ? <span className={ro}>{meta ? fmtPct(meta.pctPedidosPagadosObjetivo) : '—'}</span>
            : <input type="number" min={0} max={100} step="0.5" value={agentValues.pctPedidosPagadosObjetivo}
                onChange={(e) => handleAgent('pctPedidosPagadosObjetivo', e.target.value)}
                className={inp} />}
        </td>
      )}

      {/* Agent: % Cobranza */}
      {isVendedor ? <DisabledCell agentCol /> : (
        <td className="py-2.5 px-3 bg-blue-50/20 dark:bg-blue-950/10">
          {isLocked
            ? <span className={ro}>{meta ? fmtPct(meta.pctCobranzaObjetivo) : '—'}</span>
            : <input type="number" min={0} max={100} step="0.5" value={agentValues.pctCobranzaObjetivo}
                onChange={(e) => handleAgent('pctCobranzaObjetivo', e.target.value)}
                className={inp} />}
        </td>
      )}

      {/* ══ VENDEDOR COLUMNS (cols 6-9) ══ */}

      {/* Vendedor: Clientes Nuevos */}
      {!isVendedor ? <DisabledCell agentCol={false} /> : (
        <td className="py-2.5 px-3 bg-purple-50/20 dark:bg-purple-950/10">
          {isLocked
            ? <span className={ro}>{meta?.clientesNuevosObjetivo ?? '—'}</span>
            : <input type="number" min={0} value={vendedorValues.clientesNuevosObjetivo}
                onChange={(e) => handleVendedor('clientesNuevosObjetivo', e.target.value)}
                className={inp} />}
        </td>
      )}

      {/* Vendedor: Clientes con Primer Pedido */}
      {!isVendedor ? <DisabledCell agentCol={false} /> : (
        <td className="py-2.5 px-3 bg-purple-50/20 dark:bg-purple-950/10">
          {isLocked
            ? <span className={ro}>{meta?.pedidosObjetivo ?? '—'}</span>
            : <input type="number" min={0} value={vendedorValues.pedidosObjetivo}
                onChange={(e) => handleVendedor('pedidosObjetivo', e.target.value)}
                className={inp} />}
        </td>
      )}

      {/* Vendedor: % Cobertura Cartera */}
      {!isVendedor ? <DisabledCell agentCol={false} /> : (
        <td className="py-2.5 px-3 bg-purple-50/20 dark:bg-purple-950/10">
          {isLocked
            ? <span className={ro}>{meta ? fmtPct(meta.pctClientesConPedidoObjetivo) : '—'}</span>
            : <input type="number" min={0} max={100} step="0.5" value={vendedorValues.pctClientesConPedidoObjetivo}
                onChange={(e) => handleVendedor('pctClientesConPedidoObjetivo', e.target.value)}
                className={inp} />}
        </td>
      )}

      {/* Vendedor: % Cobranza */}
      {!isVendedor ? <DisabledCell agentCol={false} /> : (
        <td className="py-2.5 px-3 bg-purple-50/20 dark:bg-purple-950/10">
          {isLocked
            ? <span className={ro}>{meta ? fmtPct(meta.pctCobranzaObjetivo) : '—'}</span>
            : <input type="number" min={0} max={100} step="0.5" value={vendedorValues.pctCobranzaObjetivo}
                onChange={(e) => handleVendedor('pctCobranzaObjetivo', e.target.value)}
                className={inp} />}
        </td>
      )}

      {/* ── Estado + Guardar ── */}
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2 justify-between">
          <span className={cn(
            'px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap',
            hasMeta
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
          )}>
            {hasMeta ? 'Cargada' : 'Pendiente'}
          </span>
          {!isLocked && isDirty && (
            <button
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="px-2.5 py-1 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {isSaving ? 'Guardando...' : 'Guardar'}
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
