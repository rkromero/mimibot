'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Users, Package, MessageSquare } from 'lucide-react'

type Cliente = { id: string; nombre: string; apellido: string; telefono: string | null; email: string | null }
type Producto = { id: string; nombre: string; sku: string | null; precio: string; categoria: string | null }
type Contacto = { id: string; name: string; phone: string | null }

type Results = {
  clientes: Cliente[]
  productos: Producto[]
  contactos: Contacto[]
}

const EMPTY: Results = { clientes: [], productos: [], contactos: [] }

type Props = {
  open: boolean
  onClose: () => void
}

export default function GlobalSearch({ open, onClose }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Results>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQ('')
      setResults(EMPTY)
      setSelectedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q || q.length < 2) {
      setResults(EMPTY)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        if (res.ok) {
          const data = await res.json() as Results
          setResults(data)
          setSelectedIdx(0)
        }
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [q])

  // Flat list for keyboard nav
  const flatItems = [
    ...results.clientes.map((c) => ({ type: 'cliente' as const, id: c.id, label: `${c.nombre} ${c.apellido}`, sub: c.telefono ?? c.email ?? '' })),
    ...results.productos.map((p) => ({ type: 'producto' as const, id: p.id, label: p.nombre, sub: p.sku ?? '' })),
    ...results.contactos.map((c) => ({ type: 'contacto' as const, id: c.id, label: c.name, sub: c.phone ?? '' })),
  ]

  const navigate = useCallback((item: typeof flatItems[0]) => {
    onClose()
    if (item.type === 'cliente') router.push(`/crm/clientes/${item.id}`)
    else if (item.type === 'producto') router.push(`/crm/productos/${item.id}`)
    else router.push(`/inbox`)
  }, [router, onClose])

  // Keyboard navigation
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, flatItems.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)) }
      if (e.key === 'Enter' && flatItems[selectedIdx]) { navigate(flatItems[selectedIdx]) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, flatItems, selectedIdx, navigate, onClose])

  if (!open) return null

  const hasResults = flatItems.length > 0

  let globalIdx = 0
  function sectionItems<T extends { id: string }>(
    items: T[],
    render: (item: T, idx: number) => React.ReactNode,
  ) {
    return items.map((item) => {
      const idx = globalIdx++
      const isSelected = idx === selectedIdx
      return (
        <div key={item.id} data-selected={isSelected}>
          {render(item, idx)}
        </div>
      )
    })
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-start justify-center pt-16 px-4" onClick={onClose}>
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-hidden
      />
      <div
        className="relative w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search size={16} className="text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar clientes, productos, contactos..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {q && (
            <button onClick={() => setQ('')} className="text-muted-foreground hover:text-foreground transition-colors">
              <X size={15} />
            </button>
          )}
          <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-border px-1.5 text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {loading && (
            <div className="py-6 text-center text-sm text-muted-foreground">Buscando...</div>
          )}

          {!loading && q.length >= 2 && !hasResults && (
            <div className="py-6 text-center text-sm text-muted-foreground">Sin resultados para «{q}»</div>
          )}

          {!loading && !q && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Escribí para buscar — <kbd className="text-xs border border-border rounded px-1">↑↓</kbd> para navegar
            </div>
          )}

          {!loading && hasResults && (
            <div className="py-1">
              {results.clientes.length > 0 && (
                <Section icon={<Users size={12} />} label="Clientes">
                  {sectionItems(results.clientes, (c, idx) => (
                    <ResultRow
                      label={`${c.nombre} ${c.apellido}`}
                      sub={c.telefono ?? c.email ?? ''}
                      selected={idx === selectedIdx}
                      onClick={() => navigate({ type: 'cliente', id: c.id, label: '', sub: '' })}
                    />
                  ))}
                </Section>
              )}

              {results.productos.length > 0 && (
                <Section icon={<Package size={12} />} label="Productos">
                  {sectionItems(results.productos, (p, idx) => (
                    <ResultRow
                      label={p.nombre}
                      sub={[p.sku, p.categoria].filter(Boolean).join(' · ')}
                      selected={idx === selectedIdx}
                      onClick={() => navigate({ type: 'producto', id: p.id, label: '', sub: '' })}
                    />
                  ))}
                </Section>
              )}

              {results.contactos.length > 0 && (
                <Section icon={<MessageSquare size={12} />} label="Contactos">
                  {sectionItems(results.contactos, (c, idx) => (
                    <ResultRow
                      label={c.name}
                      sub={c.phone ?? ''}
                      selected={idx === selectedIdx}
                      onClick={() => navigate({ type: 'contacto', id: c.id, label: '', sub: '' })}
                    />
                  ))}
                </Section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        {icon}
        {label}
      </div>
      {children}
    </div>
  )
}

function ResultRow({ label, sub, selected, onClick }: { label: string; sub: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
        selected ? 'bg-accent text-foreground' : 'text-foreground hover:bg-accent/60'
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
      </div>
    </button>
  )
}
