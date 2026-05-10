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

interface EquipoResumenProps {
  avances: MetaAvance[]
}

const formatARS = (v: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(v)

interface KpiCardProps {
  label: string
  value: string
}

function KpiCard({ label, value }: KpiCardProps) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-1">
      <span className="text-2xl font-bold text-foreground tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

export default function EquipoResumen({ avances }: EquipoResumenProps) {
  const totalClientesNuevos = avances.reduce(
    (acc, a) => acc + a.clientesNuevos.alcanzado,
    0,
  )
  const totalPedidos = avances.reduce((acc, a) => acc + a.pedidos.alcanzado, 0)
  const totalMontoCobrado = avances.reduce(
    (acc, a) => acc + a.montoCobrado.alcanzado,
    0,
  )
  const avgConversion =
    avances.length > 0
      ? avances.reduce((acc, a) => acc + a.conversionLeads.alcanzado, 0) /
        avances.length
      : 0

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KpiCard
        label="Total Clientes Nuevos"
        value={String(totalClientesNuevos)}
      />
      <KpiCard
        label="Total Pedidos"
        value={String(totalPedidos)}
      />
      <KpiCard
        label="Total Monto Cobrado"
        value={formatARS(totalMontoCobrado)}
      />
      <KpiCard
        label="Conversión Promedio"
        value={`${Math.round(avgConversion * 100) / 100}%`}
      />
    </div>
  )
}
