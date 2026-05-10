import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { businessConfig } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { businessConfigSchema } from '@/lib/validations/business-config'

const SCHEMA_DEFAULTS = {
  id: 1,
  clienteNuevoMinPedidos: 3,
  clienteNuevoVentanaDias: 90,
  clienteNuevoMontoMinimo: null,
  clienteActivoDias: 60,
  clienteInactivoDias: 90,
  clientePerdidoDias: 180,
  clienteMorosoDias: 30,
  updatedBy: null,
  updatedAt: new Date(),
}

export async function GET(_req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    requireAdmin(session.user)

    const [config] = await db
      .select()
      .from(businessConfig)
      .where(eq(businessConfig.id, 1))
      .limit(1)

    return NextResponse.json({ data: config ?? SCHEMA_DEFAULTS })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    requireAdmin(session.user)

    const body: unknown = await req.json()
    const parsed = businessConfigSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
        { status: 400 },
      )
    }

    const input = parsed.data
    const now = new Date()
    const updatedBy = session.user.id

    const montoMinimo =
      input.clienteNuevoMontoMinimo != null
        ? String(input.clienteNuevoMontoMinimo)
        : null

    const [updated] = await db
      .insert(businessConfig)
      .values({
        id: 1,
        clienteNuevoMinPedidos: input.clienteNuevoMinPedidos,
        clienteNuevoVentanaDias: input.clienteNuevoVentanaDias,
        clienteNuevoMontoMinimo: montoMinimo,
        clienteActivoDias: input.clienteActivoDias,
        clienteInactivoDias: input.clienteInactivoDias,
        clientePerdidoDias: input.clientePerdidoDias,
        clienteMorosoDias: input.clienteMorosoDias,
        updatedBy,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: businessConfig.id,
        set: {
          clienteNuevoMinPedidos: input.clienteNuevoMinPedidos,
          clienteNuevoVentanaDias: input.clienteNuevoVentanaDias,
          clienteNuevoMontoMinimo: montoMinimo,
          clienteActivoDias: input.clienteActivoDias,
          clienteInactivoDias: input.clienteInactivoDias,
          clientePerdidoDias: input.clientePerdidoDias,
          clienteMorosoDias: input.clienteMorosoDias,
          updatedBy,
          updatedAt: now,
        },
      })
      .returning()

    return NextResponse.json({ data: updated })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
