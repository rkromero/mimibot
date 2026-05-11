'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ArrowLeft, ScanBarcode } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import ChipFilter from '@/components/shared/ChipFilter'
import QuantityInput from '@/components/shared/QuantityInput'
import dynamic from 'next/dynamic'

const BarcodeScanner = dynamic(() => import('@/components/shared/BarcodeScanner'), { ssr: false })

type SelectedItem = {
  productoId: string
  productoNombre: string
  cantidad: number
  precioUnitario: string
}

type Producto = {
  id: string
  nombre: string
  precio: string
  sku: string | null
  stockActual: number
  stockMinimo: number
  bajoCritico: boolean
  categoria: string | null
}

type Props = {
  open: boolean
  onClose: () => void
  clienteId?: string
  existingItems: SelectedItem[]
  onConfirm: (items: SelectedItem[]) => void
}

type TabKey = 'habituales' | 'todos' | 'categorias'

function formatMoney(value: number) {
  return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

export default function ProductSheet({
  open,
  onClose,
  clienteId,
  existingItems,
  onConfirm,
}: Props) {
  const [localItems, setLocalItems] = useState<SelectedItem[]>([])
  const [tab, setTab] = useState<TabKey>(clienteId ? 'habituales' : 'todos')
  const [rawSearch, setRawSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Producto | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync localItems when opening
  useEffect(() => {
    if (open) {
      setLocalItems([...existingItems])
      setRawSearch('')
      setDebouncedSearch('')
      setSelectedProduct(null)
      setTab(clienteId ? 'habituales' : 'todos')
      const timer = setTimeout(() => searchRef.current?.focus(), 150)
      return () => clearTimeout(timer)
    }
  }, [open, existingItems, clienteId])

  // 150ms debounce for search
  const handleSearchChange = useCallback((value: string) => {
    setRawSearch(value)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => setDebouncedSearch(value), 150)
  }, [])

  // Fetch all products
  const { data: rawProductos = [], isLoading: loadingProductos } = useQuery<
    Array<{ id: string; nombre: string; precio: string; sku: string | null; categoria: string | null }>
  >({
    queryKey: ['productos-activos'],
    queryFn: async () => {
      const res = await fetch('/api/productos?activo=true')
      if (!res.ok) return []
      const json = await res.json() as { data: Array<{ id: string; nombre: string; precio: string; sku: string | null; categoria: string | null }> }
      return json.data
    },
    staleTime: 60_000,
    enabled: open,
  })

  // Fetch stock saldos
  const { data: stockSaldos = [] } = useQuery<
    Array<{ id: string; stockActual: number; stockMinimo: number; bajoCritico: boolean }>
  >({
    queryKey: ['stock-saldos'],
    queryFn: async () => {
      const res = await fetch('/api/stock/saldos')
      if (!res.ok) return []
      const json = await res.json() as { data: Array<{ id: string; stockActual: number; stockMinimo: number; bajoCritico: boolean }> }
      return json.data
    },
    staleTime: 30_000,
    enabled: open,
  })

  // Fetch habituales
  const { data: habitualesRaw = [] } = useQuery<
    Array<{ id: string; nombre: string; precio: string; sku: string | null; categoria: string | null }>
  >({
    queryKey: ['cliente-habituales', clienteId],
    queryFn: async () => {
      const res = await fetch(`/api/clientes/${clienteId}/productos-habituales`)
      if (!res.ok) return []
      const json = await res.json() as { data: Array<{ id: string; nombre: string; precio: string; sku: string | null; categoria: string | null }> }
      return json.data
    },
    staleTime: 60_000,
    enabled: open && !!clienteId && tab === 'habituales',
  })

  const stockMap = new Map(stockSaldos.map((s) => [s.id, s]))

  function mergeStock(
    raw: Array<{ id: string; nombre: string; precio: string; sku: string | null; categoria: string | null }>,
  ): Producto[] {
    return raw.map((p) => {
      const stock = stockMap.get(p.id)
      return {
        ...p,
        stockActual: stock?.stockActual ?? 0,
        stockMinimo: stock?.stockMinimo ?? 0,
        bajoCritico: stock?.bajoCritico ?? false,
      }
    })
  }

  const allProductos = mergeStock(rawProductos)
  const habituales = mergeStock(habitualesRaw)

  function filterBySearch(list: Producto[]): Producto[] {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        (p.sku?.toLowerCase().includes(q) ?? false),
    )
  }

  const sourceList =
    tab === 'habituales' ? habituales : allProductos

  const filteredList = filterBySearch(sourceList)

  // Build tabs list
  const tabOptions: Array<{ key: TabKey; label: string }> = []
  if (clienteId) tabOptions.push({ key: 'habituales', label: 'Habituales' })
  tabOptions.push({ key: 'todos', label: 'Todos' })
  tabOptions.push({ key: 'categorias', label: 'Categorías' })

  // Group by categoria for "categorias" tab
  const categoriaGroups: Record<string, Producto[]> = {}
  if (tab === 'categorias') {
    for (const p of filteredList) {
      const cat = p.categoria ?? 'Sin categoría'
      if (!categoriaGroups[cat]) categoriaGroups[cat] = []
      categoriaGroups[cat].push(p)
    }
  }

  function getLocalQty(productoId: string): number {
    return localItems.find((i) => i.productoId === productoId)?.cantidad ?? 0
  }

  function handleQuantityConfirm(producto: Producto, qty: number) {
    setLocalItems((prev) => {
      if (qty <= 0) {
        return prev.filter((i) => i.productoId !== producto.id)
      }
      const existing = prev.findIndex((i) => i.productoId === producto.id)
      if (existing >= 0) {
        return prev.map((item, i) =>
          i === existing ? { ...item, cantidad: qty } : item,
        )
      }
      return [
        ...prev,
        {
          productoId: producto.id,
          productoNombre: producto.nombre,
          cantidad: qty,
          precioUnitario: producto.precio,
        },
      ]
    })
    setSelectedProduct(null)
  }

  function handleProductTap(producto: Producto) {
    if (producto.stockActual === 0) return
    setSelectedProduct(producto)
  }

  function handleScan(code: string) {
    setScannerOpen(false)
    const found = allProductos.find(
      (p) => p.sku?.toLowerCase() === code.toLowerCase(),
    )
    if (found) {
      setSelectedProduct(found)
    } else {
      // Fallback: populate search with scanned code so the user can see it
      handleSearchChange(code)
      setTab('todos')
    }
  }

  const totalCount = localItems.reduce((sum, i) => sum + i.cantidad, 0)

  if (!open) return null

  function renderProductCard(p: Producto) {
    const qty = getLocalQty(p.id)
    const outOfStock = p.stockActual === 0

    return (
      <button
        key={p.id}
        onClick={() => handleProductTap(p)}
        disabled={outOfStock}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3.5 border-b border-border active:bg-accent/50 transition-colors text-left',
          outOfStock && 'opacity-50 cursor-not-allowed',
        )}
      >
        {/* Left: name + sku */}
        <div className="flex-1 min-w-0">
          <p className="text-base font-medium text-foreground truncate">{p.nombre}</p>
          {p.sku && (
            <p className="text-xs text-muted-foreground font-mono">{p.sku}</p>
          )}
        </div>

        {/* Right: qty badge + price + stock */}
        <div className="flex items-center gap-2 shrink-0">
          {qty > 0 && (
            <span className="min-w-[24px] h-6 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
              {qty}
            </span>
          )}
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-sm text-muted-foreground">
              {formatMoney(parseFloat(p.precio))}
            </span>
            {p.bajoCritico ? (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                Stock: {p.stockActual}
              </span>
            ) : p.stockActual > 0 ? (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-50 text-green-700">
                Stock: {p.stockActual}
              </span>
            ) : (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                Sin stock
              </span>
            )}
          </div>
        </div>
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <button
          onClick={onClose}
          className="p-2 -ml-2 text-muted-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Cerrar"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="flex-1 text-base font-semibold text-foreground">Productos</h2>
        <button
          onClick={() => {
            onConfirm(localItems)
            onClose()
          }}
          className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:bg-primary/80 transition-colors min-h-[44px]"
        >
          Listo{totalCount > 0 ? ` (${totalCount})` : ''}
        </button>
      </div>

      {/* Search + scan */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 border border-border rounded-xl px-3 py-2.5 bg-muted">
            <input
              ref={searchRef}
              value={rawSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Buscar producto o SKU..."
              className="flex-1 text-[16px] bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
              inputMode="search"
            />
            {rawSearch && (
              <button
                onClick={() => {
                  handleSearchChange('')
                  searchRef.current?.focus()
                }}
                className="p-1 text-muted-foreground"
                aria-label="Limpiar"
              >
                <ArrowLeft size={16} className="rotate-180" />
              </button>
            )}
          </div>
          <button
            onClick={() => setScannerOpen(true)}
            className="flex items-center justify-center w-11 h-11 rounded-xl border border-border bg-muted text-muted-foreground hover:text-foreground hover:border-primary/40 active:scale-95 transition-all shrink-0"
            aria-label="Escanear código de barras"
            title="Escanear SKU"
          >
            <ScanBarcode size={20} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 border-b border-border">
        <ChipFilter
          options={tabOptions}
          value={tab}
          onChange={(k) => setTab(k as TabKey)}
          className="px-4"
        />
      </div>

      {/* Product list */}
      <div className="flex-1 overflow-y-auto">
        {loadingProductos ? (
          <div className="flex flex-col">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse bg-muted mx-4 my-2 h-14 rounded-xl"
              />
            ))}
          </div>
        ) : tab === 'categorias' ? (
          Object.entries(categoriaGroups).map(([cat, prods]) => (
            <div key={cat}>
              <div className="px-4 py-2 bg-muted/50 border-b border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {cat}
                </p>
              </div>
              {prods.map(renderProductCard)}
            </div>
          ))
        ) : filteredList.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">
            {debouncedSearch ? 'Sin resultados' : 'No hay productos disponibles'}
          </p>
        ) : (
          filteredList.map(renderProductCard)
        )}
      </div>

      {/* QuantityInput overlay */}
      {selectedProduct && (
        <QuantityInput
          produto={{
            nombre: selectedProduct.nombre,
            precio: selectedProduct.precio,
            stockActual: selectedProduct.stockActual,
          }}
          initialQty={getLocalQty(selectedProduct.id) || 1}
          onConfirm={(qty) => handleQuantityConfirm(selectedProduct, qty)}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {/* Barcode scanner overlay */}
      {scannerOpen && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => setScannerOpen(false)}
        />
      )}
    </div>
  )
}
