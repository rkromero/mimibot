import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { cotizadorConfig, escalonesVolumen } from '@/db/schema'
import { eq, asc } from 'drizzle-orm'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { cotizadorConfigSchema } from '@/lib/validations/cotizador'
import { COTIZADOR_CONFIG_DEFAULTS } from '@/lib/cotizador/snapshot'

export async function GET() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)

    const [config] = await db
      .select()
      .from(cotizadorConfig)
      .where(eq(cotizadorConfig.id, 1))
      .limit(1)

    const escalones = await db
      .select()
      .from(escalonesVolumen)
      .orderBy(asc(escalonesVolumen.orden))

    return NextResponse.json({
      data: {
        config: config ?? {
          id: 1,
          margenPct: COTIZADOR_CONFIG_DEFAULTS.margenPct.toFixed(2),
          cargoSetupPersonalizado: COTIZADOR_CONFIG_DEFAULTS.cargoSetupPersonalizado.toFixed(2),
          alfajoresPorCaja: COTIZADOR_CONFIG_DEFAULTS.alfajoresPorCaja,
          validezDias: COTIZADOR_CONFIG_DEFAULTS.validezDias,
          topeDescuentoPct: COTIZADOR_CONFIG_DEFAULTS.topeDescuentoPct.toFixed(2),
          condicionesComerciales: COTIZADOR_CONFIG_DEFAULTS.condicionesComerciales,
        },
        escalones,
      },
    })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)

    const body: unknown = await req.json()
    const parsed = cotizadorConfigSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const input = parsed.data
    const values = {
      margenPct: input.margenPct.toFixed(2),
      cargoSetupPersonalizado: input.cargoSetupPersonalizado.toFixed(2),
      alfajoresPorCaja: input.alfajoresPorCaja,
      validezDias: input.validezDias,
      topeDescuentoPct: input.topeDescuentoPct.toFixed(2),
      ...(input.condicionesComerciales !== undefined
        ? { condicionesComerciales: input.condicionesComerciales }
        : {}),
      updatedBy: session.user.id,
      updatedAt: new Date(),
    }

    const [updated] = await db
      .insert(cotizadorConfig)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({ target: cotizadorConfig.id, set: values })
      .returning()

    return NextResponse.json({ data: updated })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
