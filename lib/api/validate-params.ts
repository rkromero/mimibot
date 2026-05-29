import { NextResponse } from 'next/server'

// RFC 4122 UUID regex — covers v1–v5 and nil UUID
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Returns a 400 NextResponse if `id` is not a valid UUID, or null if it is.
 *
 * Call this at the start of every route handler that receives a UUID path
 * parameter, BEFORE any DB query. Prevents Postgres from receiving
 * "invalid input syntax for type uuid" and propagating it as 500.
 *
 * Usage:
 *   const { id } = await params
 *   const invalid = validateUuidParam(id)
 *   if (invalid) return invalid
 */
export function validateUuidParam(id: string): NextResponse | null {
  if (UUID_REGEX.test(id)) return null
  return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
}
