export type Paginated<T> = {
  data: T[]
  page: number
  limit: number
  total: number
  totalPages: number
}

export type PaginationQuery = {
  page?: number
  limit?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  search?: string
}
