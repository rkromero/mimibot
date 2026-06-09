'use client'

type EstadoMeta = 'en_curso' | 'cumplida' | 'no_cumplida'
type EstadoCobertura = EstadoMeta | 'na'

interface MetricaAvance {
  alcanzado: number
  pct: number
  proyeccion: number
  estado: EstadoMeta
}

interface MetricaCobertura {
  alcanzado: number | null
  pct: number | null
  proyeccion: number | null
  estado: EstadoCobertura
}

interface MetaAvance {
  meta: {
    id: string
    vendedorId: string
    periodoAnio: number
    periodoMes: number
    clientesNuevosObjetivo: number
    pedidosObjetivo: number
    montoCobradoObjetivo: string
    conversionLeadsObjetivo: string
    pctClientesConPedidoObjetivo: string
    pctPedidosPagadosObjetivo: string
    pctCobranzaObjetivo: string
  }
  clientesNuevos: MetricaAvance
  clientesPrimerPedido: MetricaAvance
  pedidos: MetricaAvance
  montoCobrado: MetricaAvance
  conversionLeads: MetricaAvance
  pctClientesConPedido: MetricaCobertura
  pctPedidosPagados: MetricaCobertura
  pctCobranza: MetricaCobertura
}

interface User {
  id: string
  name: string | null
  email: string
  role: 'admin' | 'gerente' | 'agent' | 'vendedor'
  avatarColor: string
  isActive: boolean
}

interface VendedoresGridProps {
  avances: MetaAvance[]
  users: User[]
  onSelectVendedor: (vendedorId: string) => void
}

function metricColorClass(pct: number, estado: EstadoMeta): string {
  if (estado === 'cumplida') return 'text-green-600'
  if (estado === 'no_cumplida') return 'text-red-600'
  if (pct >= 50) return 'text-amber-600'
  return 'text-red-600'
}

function metricBarClass(pct: number, estado: EstadoMeta): string {
  if (estado === 'cumplida') return 'bg-green-500'
  if (estado === 'no_cumplida') return 'bg-red-400'
  if (pct >= 50) return 'bg-amber-500'
  return 'bg-red-500'
}

interface MetricCellProps {
  alcanzado: string
  objetivo: string
  pct: number
  estado: EstadoMeta
}

function MetricCell({ alcanzado, objetivo, pct, estado }: MetricCellProps) {
  const colorClass = metricColorClass(pct, estado)
  const barClass = metricBarClass(pct, estado)
  const barWidth = Math.min(pct, 100)

  return (
    <div className="flex flex-col items-start gap-0.5 min-w-[100px]">
      <span className={`text-sm font-medium tabular-nums ${colorClass}`}>
        {alcanzado}
        <span className="text-muted-foreground font-normal">/{objetivo}</span>
        <span className="ml-1 text-xs">({pct}%)</span>
      </span>
      <div className="h-1 w-full rounded-full bg-gray-100 mt-0.5">
        <div
          className={`h-1 rounded-full transition-all duration-300 ${barClass}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  )
}

function proyeccionGeneral(a: MetaAvance, role: string): number {
  if (role === 'agent') {
    const values: { v: number; obj: number }[] = [
      { v: a.clientesNuevos.proyeccion, obj: a.meta.clientesNuevosObjetivo },
      { v: a.conversionLeads.proyeccion, obj: parseFloat(a.meta.conversionLeadsObjetivo) },
    ]
    if (a.pctClientesConPedido.estado !== 'na') {
      values.push({
        v: a.pctClientesConPedido.proyeccion ?? 0,
        obj: parseFloat(a.meta.pctClientesConPedidoObjetivo),
      })
    }
    if (a.pctCobranza.estado !== 'na') {
      values.push({
        v: a.pctCobranza.proyeccion ?? 0,
        obj: parseFloat(a.meta.pctCobranzaObjetivo),
      })
    }
    const pcts = values.map(({ v, obj }) =>
      obj > 0 ? Math.min(Math.round((v / obj) * 100), 999) : 100,
    )
    return Math.min(Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length), 999)
  }
  // Vendedor
  const values: { v: number; obj: number }[] = [
    { v: a.clientesNuevos.proyeccion, obj: a.meta.clientesNuevosObjetivo },
    { v: a.clientesPrimerPedido.proyeccion, obj: a.meta.pedidosObjetivo },
  ]
  if (a.pctClientesConPedido.estado !== 'na') {
    values.push({
      v: a.pctClientesConPedido.proyeccion ?? 0,
      obj: parseFloat(a.meta.pctClientesConPedidoObjetivo),
    })
  }
  if (a.pctCobranza.estado !== 'na') {
    values.push({
      v: a.pctCobranza.proyeccion ?? 0,
      obj: parseFloat(a.meta.pctCobranzaObjetivo),
    })
  }
  const pcts = values.map(({ v, obj }) =>
    obj > 0 ? Math.min(Math.round((v / obj) * 100), 999) : 100,
  )
  return Math.min(Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length), 999)
}

function ProyeccionCell({ proy }: { proy: number }) {
  return (
    <div className="flex flex-col items-start gap-0.5 min-w-[80px]">
      <span
        className={`text-sm font-semibold tabular-nums ${
          proy >= 100 ? 'text-green-600' : proy >= 50 ? 'text-amber-600' : 'text-red-600'
        }`}
      >
        {proy >= 999 ? '>999' : proy}%
      </span>
      <div className="h-1 w-full rounded-full bg-gray-100 mt-0.5">
        <div
          className={`h-1 rounded-full transition-all duration-300 ${
            proy >= 100 ? 'bg-green-500' : proy >= 50 ? 'bg-amber-500' : 'bg-red-500'
          }`}
          style={{ width: `${Math.min(proy, 100)}%` }}
        />
      </div>
    </div>
  )
}

export default function VendedoresGrid({
  avances,
  users,
  onSelectVendedor,
}: VendedoresGridProps) {
  const avanceMap = new Map(avances.map((a) => [a.meta.vendedorId, a]))

  const agentesConMeta = avances
    .map((a) => ({ avance: a, user: users.find((u) => u.id === a.meta.vendedorId) }))
    .filter(({ user }) => user?.role === 'agent')

  const vendedoresConMeta = avances
    .map((a) => ({ avance: a, user: users.find((u) => u.id === a.meta.vendedorId) }))
    .filter(({ user }) => user?.role === 'vendedor')

  const agentesSinMeta = users.filter((u) => u.role === 'agent' && !avanceMap.has(u.id))
  const vendedoresSinMeta = users.filter((u) => u.role === 'vendedor' && !avanceMap.has(u.id))

  const showAgentes = agentesConMeta.length > 0 || agentesSinMeta.length > 0
  const showVendedores = vendedoresConMeta.length > 0 || vendedoresSinMeta.length > 0

  return (
    <div className="flex flex-col gap-6">
      {showAgentes && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2 px-1">Agentes</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                    Vendedor
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                    Clientes Nuevos
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                    Conv. Leads
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                    Cobertura
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                    % Cobranza
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                    Proyección General
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {agentesConMeta.map(({ avance, user }) => {
                  const nombre = user?.name ?? user?.email ?? avance.meta.vendedorId
                  const proy = proyeccionGeneral(avance, 'agent')
                  return (
                    <tr
                      key={avance.meta.vendedorId}
                      onClick={() => onSelectVendedor(avance.meta.vendedorId)}
                      className="hover:bg-accent/50 cursor-pointer transition-colors duration-100"
                    >
                      <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                        {nombre}
                      </td>
                      <td className="px-4 py-3">
                        <MetricCell
                          alcanzado={String(avance.clientesNuevos.alcanzado)}
                          objetivo={String(avance.meta.clientesNuevosObjetivo)}
                          pct={avance.clientesNuevos.pct}
                          estado={avance.clientesNuevos.estado}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <MetricCell
                          alcanzado={`${avance.conversionLeads.alcanzado}%`}
                          objetivo={`${avance.meta.conversionLeadsObjetivo}%`}
                          pct={avance.conversionLeads.pct}
                          estado={avance.conversionLeads.estado}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {avance.pctClientesConPedido.estado === 'na' ? (
                          <span className="text-sm text-muted-foreground">Sin cartera</span>
                        ) : (
                          <MetricCell
                            alcanzado={`${avance.pctClientesConPedido.alcanzado}%`}
                            objetivo={`${avance.meta.pctClientesConPedidoObjetivo}%`}
                            pct={avance.pctClientesConPedido.pct ?? 0}
                            estado={avance.pctClientesConPedido.estado as EstadoMeta}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {avance.pctCobranza.estado === 'na' ? (
                          <span className="text-sm text-muted-foreground">—</span>
                        ) : (
                          <MetricCell
                            alcanzado={`${avance.pctCobranza.alcanzado}%`}
                            objetivo={`${avance.meta.pctCobranzaObjetivo}%`}
                            pct={avance.pctCobranza.pct ?? 0}
                            estado={avance.pctCobranza.estado as EstadoMeta}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <ProyeccionCell proy={proy} />
                      </td>
                    </tr>
                  )
                })}
                {agentesSinMeta.map((user) => (
                  <tr key={user.id} className="opacity-60">
                    <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                      {user.name ?? user.email}
                    </td>
                    <td colSpan={5} className="px-4 py-3 text-amber-600 text-xs font-medium">
                      Sin meta para este período
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showVendedores && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2 px-1">Vendedores</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                    Vendedor
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                    Clientes Nuevos
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                    Cl. c/PP
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                    Cobertura
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                    % Cobranza
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                    Proyección General
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {vendedoresConMeta.map(({ avance, user }) => {
                  const nombre = user?.name ?? user?.email ?? avance.meta.vendedorId
                  const proy = proyeccionGeneral(avance, 'vendedor')
                  return (
                    <tr
                      key={avance.meta.vendedorId}
                      onClick={() => onSelectVendedor(avance.meta.vendedorId)}
                      className="hover:bg-accent/50 cursor-pointer transition-colors duration-100"
                    >
                      <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                        {nombre}
                      </td>
                      <td className="px-4 py-3">
                        <MetricCell
                          alcanzado={String(avance.clientesNuevos.alcanzado)}
                          objetivo={String(avance.meta.clientesNuevosObjetivo)}
                          pct={avance.clientesNuevos.pct}
                          estado={avance.clientesNuevos.estado}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <MetricCell
                          alcanzado={String(avance.clientesPrimerPedido.alcanzado)}
                          objetivo={String(avance.meta.pedidosObjetivo)}
                          pct={avance.clientesPrimerPedido.pct}
                          estado={avance.clientesPrimerPedido.estado}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {avance.pctClientesConPedido.estado === 'na' ? (
                          <span className="text-sm text-muted-foreground">Sin cartera</span>
                        ) : (
                          <MetricCell
                            alcanzado={`${avance.pctClientesConPedido.alcanzado}%`}
                            objetivo={`${avance.meta.pctClientesConPedidoObjetivo}%`}
                            pct={avance.pctClientesConPedido.pct ?? 0}
                            estado={avance.pctClientesConPedido.estado as EstadoMeta}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {avance.pctCobranza.estado === 'na' ? (
                          <span className="text-sm text-muted-foreground">—</span>
                        ) : (
                          <MetricCell
                            alcanzado={`${avance.pctCobranza.alcanzado}%`}
                            objetivo={`${avance.meta.pctCobranzaObjetivo}%`}
                            pct={avance.pctCobranza.pct ?? 0}
                            estado={avance.pctCobranza.estado as EstadoMeta}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <ProyeccionCell proy={proy} />
                      </td>
                    </tr>
                  )
                })}
                {vendedoresSinMeta.map((user) => (
                  <tr key={user.id} className="opacity-60">
                    <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                      {user.name ?? user.email}
                    </td>
                    <td colSpan={5} className="px-4 py-3 text-amber-600 text-xs font-medium">
                      Sin meta para este período
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
