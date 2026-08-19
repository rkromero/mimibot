import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { recetas } from '@/db/schema'
import { eq, asc } from 'drizzle-orm'
import { toApiError } from '@/lib/errors'

// Gramajes de las recetas activas, para el select del modal de cotización.
// Accesible a cualquier usuario logueado (los vendedores cotizan).
export async function GET() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rows = await db
      .select({ gramaje: recetas.gramaje })
      .from(recetas)
      .where(eq(recetas.activo, true))
      .orderBy(asc(recetas.gramaje))

    return NextResponse.json({ data: rows.map((r) => r.gramaje) })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
