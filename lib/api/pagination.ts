import type { PaginationQuery } from '@/lib/types/pagination'

function safeInt(raw: string | null, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

export function parsePagination(
  searchParams: URLSearchParams,
  defaults?: Partial<PaginationQuery>,
): Required<PaginationQuery> {
  const page = Math.max(1, safeInt(searchParams.get('page'), defaults?.page ?? 1))
  const limit = Math.min(200, Math.max(1, safeInt(searchParams.get('limit'), defaults?.limit ?? 50)))
  const sortBy = searchParams.get('sortBy') ?? defaults?.sortBy ?? 'createdAt'
  const rawDir = searchParams.get('sortDir') ?? defaults?.sortDir ?? 'desc'
  const sortDir: 'asc' | 'desc' = rawDir === 'asc' ? 'asc' : 'desc'
  const search = searchParams.get('search') ?? defaults?.search ?? ''
  return { page, limit, sortBy, sortDir, search }
}
