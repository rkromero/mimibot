import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { z } from 'zod'
import { db } from '@/db'
import { clientes } from '@/db/schema'
import { geocodeClienteIfNeeded } from '@/lib/geo/geocode.service'
import { validateUuidParam } from '@/lib/api/validate-params'

// geocode_status es text libre (ver db/schema.ts), no un enum de Postgres,
// así que 'manual' se puede persistir sin migración.
const bodySchema = z.object({
  modo: z.enum(['geocode', 'limpiar']).default('geocode'),
})

type RouteCtx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: RouteCtx) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    requireAdmin(session.user)

    const { id: clienteId } = await params
    const invalid = validateUuidParam(clienteId)
    if (invalid) return invalid

    // body opcional: si no viene o viene vacío, cae a modo 'geocode'.
    let modo: 'geocode' | 'limpiar' = 'geocode'
    try {
      const body: unknown = await req.json()
      const parsed = bodySchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
      }
      modo = parsed.data.modo
    } catch {
      // sin body -> default 'geocode'
    }

    if (modo === 'limpiar') {
      // Borra las coordenadas para que la navegación caiga a la dirección de texto.
      await db
        .update(clientes)
        .set({ lat: null, lng: null, geocodeStatus: 'manual', geocodedAt: new Date() })
        .where(eq(clientes.id, clienteId))
    } else {
      // Re-geocodifica forzado; en fallo deja lat/lng=null y status='failed'.
      await geocodeClienteIfNeeded(clienteId, { force: true })
    }

    const updated = await db.query.clientes.findFirst({
      where: eq(clientes.id, clienteId),
      columns: { lat: true, lng: true, geocodeStatus: true },
    })
    if (!updated) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

    return NextResponse.json({ data: updated })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
