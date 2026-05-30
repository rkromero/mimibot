'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Phone, ChevronRight, Download, Map, List } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import CreateClienteModal from './CreateClienteModal'
import dynamic from 'next/dynamic'
import DataTable from '@/components/data-table/DataTable'

const ClientesMap = dynamic(() => import('./ClientesMap'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-sm text-muted-foreground">Cargando mapa...</div>
    </div>
  ),
})

type Cliente = {
  id: string
  nombre: string
  apellido: string
  email: string | null
  telefono: string | null
  cuit: string | null
  origen: 'manual' | 'convertido_de_lead'
  estadoActividad: 'activo' | 'inactivo' | 'perdido' | null
  asignadoA: string | null
  asignadoNombre: string | null
  asignadoColor: string | null
  saldoPendiente?: string | null
  createdAt: string
}

const estadoActividadLabels: Record<string, string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
  perdido: 'Perdido',
}

const estadoActividadColors: Record<string, string> = {
  activo: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  inactivo: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  perdido: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}

const origenLabels: Record<string, string> = {
  manual: 'Manual',
  convertido_de_lead: 'Lead',
}
const origenColors: Record<string, string> = {
  manual: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  convertido_de_lead: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
}

export default function ClientesListView() {
  const router = useRouter()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const [filterEstado, setFilterEstado] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [mapView, setMapView] = useState(false)
  const [mapClientes, setMapClientes] = useState<Cliente[]>([])

  async function handleExport() {
    setIsExporting(true)
    try {
      const res = await fetch('/api/export/clientes')
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `clientes_${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setIsExporting(false)
    }
  }

  const columns = [
    {
      key: 'nombre',
      label: 'Nombre',
      sortable: true,
      render: (row: Cliente) => (
        <span className="font-medium text-foreground">
          {row.nombre} {row.apellido}
        </span>
      ),
    },
    {
      key: 'email',
      label: 'Email',
      render: (row: Cliente) => (
        <span className="text-muted-foreground">{row.email ?? '—'}</span>
      ),
    },
    {
      key: 'telefono',
      label: 'Teléfono',
      render: (row: Cliente) => (
        <span className="text-muted-foreground">{row.telefono ?? '—'}</span>
      ),
    },
    {
      key: 'origen',
      label: 'Origen',
      render: (row: Cliente) => (
        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', origenColors[row.origen])}>
          {origenLabels[row.origen]}
        </span>
      ),
    },
    {
      key: 'estadoActividad',
      label: 'Estado',
      sortable: true,
      render: (row: Cliente) =>
        row.estadoActividad ? (
          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', estadoActividadColors[row.estadoActividad])}>
            {estadoActividadLabels[row.estadoActividad]}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    ...(isAdmin
      ? [
          {
            key: 'asignadoNombre',
            label: 'Asignado a',
            render: (row: Cliente) =>
              row.asignadoNombre ? (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span
                    className="w-5 h-5 rounded-full inline-flex items-center justify-center text-white text-xs shrink-0"
                    style={{ backgroundColor: row.asignadoColor ?? '#6b7280' }}
                  >
                    {(row.asignadoNombre ?? '?')[0]?.toUpperCase()}
                  </span>
                  {row.asignadoNombre}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
          },
        ]
      : []),
  ]

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="p-4 md:p-6 pb-24 md:pb-6">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <h1 className="text-lg md:text-xl font-semibold text-foreground">Clientes</h1>
          <div className="flex items-center gap-2">
            <div className="flex md:hidden items-center rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setMapView(false)}
                title="Lista"
                className={`p-2 transition-colors ${!mapView ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >
                <List size={14} />
              </button>
              <button
                onClick={() => setMapView(true)}
                title="Mapa"
                className={`p-2 transition-colors ${mapView ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >
                <Map size={14} />
              </button>
            </div>
            <div className="hidden md:flex items-center gap-2">
              <button
                onClick={() => void handleExport()}
                disabled={isExporting}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              >
                <Download size={13} />
                CSV
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Plus size={14} />
                Agregar Cliente
              </button>
            </div>
          </div>
        </div>

        {/* Extra filter (outside DataTable) */}
        <div className="flex items-center gap-2 mb-4">
          <select
            value={filterEstado}
            onChange={(e) => setFilterEstado(e.target.value)}
            className="px-3 py-2.5 md:py-1.5 text-[16px] md:text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
          >
            <option value="">Todos los estados</option>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
            <option value="perdido">Perdido</option>
          </select>
        </div>

        {/* Mobile map view */}
        {mapView && (
          <div className="md:hidden fixed inset-0 top-0 z-20 bg-background flex flex-col pt-16">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold">Clientes en el mapa</h2>
              <button
                onClick={() => setMapView(false)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <List size={13} />
                Lista
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <ClientesMap clientes={mapClientes} />
            </div>
          </div>
        )}

        <DataTable<Cliente>
          endpoint="/api/clientes"
          columns={columns}
          extraParams={filterEstado ? { estadoActividad: filterEstado } : {}}
          defaultPageSize={50}
          searchPlaceholder="Buscar por nombre, email, CUIT..."
          onRowClick={(row) => router.push(`/crm/clientes/${row.id}`)}
          renderMobileCard={(c) => {
            const saldo = c.saldoPendiente ? parseFloat(c.saldoPendiente) : 0
            return (
              <div
                key={c.id}
                onClick={() => router.push(`/crm/clientes/${c.id}`)}
                className="bg-card border border-border rounded-xl p-4 flex items-center gap-3 active:bg-accent/60 cursor-pointer transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground text-base truncate">
                    {c.nombre} {c.apellido}
                  </p>
                  {c.telefono && (
                    <a
                      href={`tel:${c.telefono}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1.5 text-sm text-primary mt-0.5 w-fit"
                    >
                      <Phone size={13} />
                      {c.telefono}
                    </a>
                  )}
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {c.estadoActividad && (
                      <span className={cn('px-1.5 py-0.5 rounded-full text-xs font-medium', estadoActividadColors[c.estadoActividad])}>
                        {estadoActividadLabels[c.estadoActividad]}
                      </span>
                    )}
                    {saldo > 0 && (
                      <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                        Debe: ${saldo.toLocaleString('es-AR', { minimumFractionDigits: 0 })}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight size={18} className="text-muted-foreground shrink-0" />
              </div>
            )
          }}
          emptyMessage="No hay clientes registrados"
        />
      </div>

      <button
        onClick={() => setShowCreate(true)}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-30 flex items-center gap-2 h-14 rounded-full bg-primary text-primary-foreground shadow-lg px-5 md:hidden active:scale-95 transition-transform"
        aria-label="Agregar cliente"
      >
        <Plus size={20} strokeWidth={2} />
        <span className="text-sm font-semibold pr-1">Cliente</span>
      </button>

      {showCreate && <CreateClienteModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
