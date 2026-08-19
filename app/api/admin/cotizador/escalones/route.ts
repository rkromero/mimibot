import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { escalonesVolumen } from '@/db/schema'
import { asc } from 'drizzle-orm'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { escalonesSchema } from '@/lib/validations/cotizador'

// Reemplaza la lista completa de escalones (el orden del array define `orden`)
export async function PUT(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)

    const body: unknown = await req.json()
    const parsed = escalonesSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    await db.transaction(async (tx) => {
      await tx.delete(escalonesVolumen)
      if (parsed.data.escalones.length > 0) {
        await tx.insert(escalonesVolumen).values(
          parsed.data.escalones.map((e, index) => ({
            cantidadMin: e.cantidadMin,
            cantidadMax: e.cantidadMax,
            descuentoPct: e.descuentoPct.toFixed(2),
            orden: index,
          })),
        )
      }
    })

    const data = await db
      .select()
      .from(escalonesVolumen)
      .orderBy(asc(escalonesVolumen.orden))

    return NextResponse.json({ data })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
