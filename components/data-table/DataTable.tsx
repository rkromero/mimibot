'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Paginated } from '@/lib/types/pagination'

export type DataTableColumn<T> = {
  key: string
  label: string
  sortable?: boolean
  className?: string
  headerClassName?: string
  render?: (row: T) => React.ReactNode
}

type Props<T extends { id: string }> = {
  endpoint: string
  columns: DataTableColumn<T>[]
  extraParams?: Record<string, string>
  defaultPageSize?: number
  searchPlaceholder?: string
  showSearch?: boolean
  onRowClick?: (row: T) => void
  renderMobileCard?: (row: T) => React.ReactNode
  emptyMessage?: string
  emptyState?: React.ReactNode
}

const PAGE_SIZES = [10, 25, 50, 100] as const

function useDebounce<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export default function DataTable<T extends { id: string }>({
  endpoint,
  columns,
  extraParams = {},
  defaultPageSize = 50,
  searchPlaceholder = 'Buscar...',
  showSearch = true,
  onRowClick,
  renderMobileCard,
  emptyMessage = 'No hay registros',
  emptyState,
}: Props<T>) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const limit = Math.min(
    200,
    Math.max(1, parseInt(searchParams.get('limit') ?? String(defaultPageSize), 10) || defaultPageSize),
  )
  const sortBy = searchParams.get('sortBy') ?? 'createdAt'
  const sortDir = (searchParams.get('sortDir') ?? 'desc') as 'asc' | 'desc'

  const [localSearch, setLocalSearch] = useState(searchParams.get('search') ?? '')
  const debouncedSearch = useDebounce(localSearch, 250)

  const extraParamsKey = JSON.stringify(extraParams)
  const prevExtraKey = useRef(extraParamsKey)
  const prevSearch = useRef(debouncedSearch)

  function buildUrl(updates: Record<string, string | number | null>): string {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') {
        next.delete(key)
      } else {
        next.set(key, String(value))
      }
    }
    return `${pathname}?${next.toString()}`
  }

  useEffect(() => {
    const extraChanged = extraParamsKey !== prevExtraKey.current
    const searchChanged = debouncedSearch !== prevSearch.current
    if (extraChanged || searchChanged) {
      prevExtraKey.current = extraParamsKey
      prevSearch.current = debouncedSearch
      router.replace(
        buildUrl({ page: 1, search: debouncedSearch || null }),
        { scroll: false },
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, extraParamsKey])

  const fetchParams = new URLSearchParams()
  fetchParams.set('page', String(page))
  fetchParams.set('limit', String(limit))
  fetchParams.set('sortBy', sortBy)
  fetchParams.set('sortDir', sortDir)
  if (debouncedSearch) fetchParams.set('search', debouncedSearch)
  for (const [k, v] of Object.entries(extraParams)) {
    if (v) fetchParams.set(k, v)
  }

  const { data, isLoading, isError, refetch } = useQuery<Paginated<T>>({
    queryKey: [endpoint, page, limit, sortBy, sortDir, debouncedSearch, extraParamsKey],
    queryFn: async () => {
      const res = await fetch(`${endpoint}?${fetchParams.toString()}`)
      if (!res.ok) throw new Error('Error al cargar datos')
      return res.json() as Promise<Paginated<T>>
    },
    placeholderData: (prev) => prev,
  })

  const rows = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  function handleSort(key: string) {
    router.replace(
      buildUrl({
        sortBy: key,
        sortDir: sortBy === key && sortDir === 'desc' ? 'asc' : 'desc',
        page: 1,
      }),
      { scroll: false },
    )
  }

  function goToPage(p: number) {
    router.replace(buildUrl({ page: p }), { scroll: false })
  }

  function setPageSize(size: number) {
    router.replace(buildUrl({ limit: size, page: 1 }), { scroll: false })
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, total)
  const skeletonRows = Array.from({ length: Math.min(limit, 8) })

  return (
    <div>
      {showSearch && (
        <div className="relative mb-4">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full md:max-w-sm pl-10 pr-3 py-2.5 md:py-1.5 border border-border rounded-lg text-[16px] md:text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      {renderMobileCard && (
        <div className="md:hidden">
          {isLoading ? (
            <div className="space-y-2">
              {skeletonRows.map((_, i) => (
                <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse">
                  <div className="space-y-2">
                    <div className="h-4 bg-muted rounded w-2/5" />
                    <div className="h-3 bg-muted rounded w-1/3" />
                    <div className="h-3 bg-muted rounded w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-sm text-destructive">
              Error al cargar.{' '}
              <button onClick={() => void refetch()} className="underline">
                Reintentar
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {emptyState ?? emptyMessage}
            </div>
          ) : (
            <div className="space-y-2">{rows.map((row) => renderMobileCard(row))}</div>
          )}
        </div>
      )}

      <div
        className={cn(
          'bg-card border border-border rounded-lg overflow-hidden',
          renderMobileCard ? 'hidden md:block' : 'block',
        )}
      >
        {isLoading ? (
          <table className="w-full text-sm">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      'text-left py-2 px-3 text-muted-foreground font-medium border-b border-border',
                      col.headerClassName,
                    )}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="animate-pulse">
              {skeletonRows.map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {columns.map((col) => (
                    <td key={col.key} className="py-2.5 px-3">
                      <div className="h-3.5 bg-muted rounded w-3/4" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : isError ? (
          <div className="p-8 text-center text-sm text-destructive">
            Error al cargar.{' '}
            <button onClick={() => void refetch()} className="underline">
              Reintentar
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {emptyState ?? emptyMessage}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      'text-left py-2 px-3 text-muted-foreground font-medium border-b border-border',
                      col.sortable && 'cursor-pointer select-none hover:text-foreground',
                      col.headerClassName,
                    )}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {col.sortable &&
                        (sortBy === col.key ? (
                          sortDir === 'asc' ? (
                            <ChevronUp size={13} />
                          ) : (
                            <ChevronDown size={13} />
                          )
                        ) : (
                          <ChevronsUpDown size={13} className="opacity-40" />
                        ))}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'border-b border-border last:border-0 transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-accent/50',
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={cn('py-2.5 px-3', col.className)}>
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!isLoading && total > 0 && (
        <div className="flex items-center justify-between mt-3 text-sm text-muted-foreground flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span>
              {from.toLocaleString('es-AR')}–{to.toLocaleString('es-AR')} de{' '}
              {total.toLocaleString('es-AR')}
            </span>
            <select
              value={limit}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="border border-border rounded px-1.5 py-0.5 text-xs bg-background"
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s} por pág.
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="p-1.5 rounded hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Pagina anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-2 tabular-nums">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
              className="p-1.5 rounded hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Pagina siguiente"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
