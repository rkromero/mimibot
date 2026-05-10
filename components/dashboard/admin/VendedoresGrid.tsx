'use client'

type EstadoMeta = 'en_curso' | 'cumplida' | 'no_cumplida'

interface MetricaAvance {
  alcanzado: number
  pct: number
  proyeccion: number
  estado: EstadoMeta
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
  }
  clientesNuevos: MetricaAvance
  pedidos: MetricaAvance
  montoCobrado: MetricaAvance
  conversionLeads: MetricaAvance
}

interface User {
  id: string
  name: string | null
  email: string
  role: 'admin' | 'agent'
  avatarColor: string
  isActive: boolean
}

interface VendedoresGridProps {
  avances: MetaAvance[]
  users: User[]
  onSelectVendedor: (vendedorId: string) => void
}

const formatARS = (v: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(v)

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

export default function VendedoresGrid({
  avances,
  users,
  onSelectVendedor,
}: VendedoresGridProps) {
  const agents = users.filter((u) => u.role === 'agent')
  const avanceMap = new Map(avances.map((a) => [a.meta.vendedorId, a]))

  const vendedoresConMeta = avances.map((a) => {
    const user = users.find((u) => u.id === a.meta.vendedorId)
    return { avance: a, user }
  })

  const vendedoresSinMeta = agents.filter((u) => !avanceMap.has(u.id))

  const proyeccionGeneral = (a: MetaAvance): number => {
    const values = [
      a.clientesNuevos.proyeccion,
      a.pedidos.proyeccion,
      a.montoCobrado.proyeccion,
      a.conversionLeads.proyeccion,
    ]
    const pcts = values.map((v, i) => {
      const obj =
        i === 0
          ? a.meta.clientesNuevosObjetivo
          : i === 1
            ? a.meta.pedidosObjetivo
            : i === 2
              ? parseFloat(a.meta.montoCobradoObjetivo)
              : parseFloat(a.meta.conversionLeadsObjetivo)
      return obj > 0 ? Math.round((v / obj) * 100) : 100
    })
    return Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length)
  }

  return (
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
              Pedidos
            </th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
              Monto Cobrado
            </th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
              Conv. Leads
            </th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
              Proyección General
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {vendedoresConMeta.map(({ avance, user }) => {
            const nombre =
              user?.name ?? user?.email ?? avance.meta.vendedorId
            const proy = proyeccionGeneral(avance)

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
                    alcanzado={String(avance.pedidos.alcanzado)}
                    objetivo={String(avance.meta.pedidosObjetivo)}
                    pct={avance.pedidos.pct}
                    estado={avance.pedidos.estado}
                  />
                </td>
                <td className="px-4 py-3">
                  <MetricCell
                    alcanzado={formatARS(avance.montoCobrado.alcanzado)}
                    objetivo={formatARS(
                      parseFloat(avance.meta.montoCobradoObjetivo),
                    )}
                    pct={avance.montoCobrado.pct}
                    estado={avance.montoCobrado.estado}
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
                  <div className="flex flex-col items-start gap-0.5 min-w-[80px]">
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        proy >= 100
                          ? 'text-green-600'
                          : proy >= 50
                            ? 'text-amber-600'
                            : 'text-red-600'
                      }`}
                    >
                      {proy}%
                    </span>
                    <div className="h-1 w-full rounded-full bg-gray-100 mt-0.5">
                      <div
                        className={`h-1 rounded-full transition-all duration-300 ${
                          proy >= 100
                            ? 'bg-green-500'
                            : proy >= 50
                              ? 'bg-amber-500'
                              : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(proy, 100)}%` }}
                      />
                    </div>
                  </div>
                </td>
              </tr>
            )
          })}

          {vendedoresSinMeta.map((user) => (
            <tr key={user.id} className="opacity-60">
              <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                {user.name ?? user.email}
              </td>
              <td
                colSpan={5}
                className="px-4 py-3 text-amber-600 text-xs font-medium"
              >
                Sin meta para este período
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
