import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { metas, users } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { createMetaSchema } from '@/lib/validations/metas'
import { toApiError, AuthzError } from '@/lib/errors'
import { createMeta, getMetaByVendedorPeriodo, isMesBloqueable } from '@/lib/metas/metas.service'
import { getSessionContext } from '@/lib/territorios/context'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const ctx = await getSessionContext(session.user)

    const params = req.nextUrl.searchParams
    const anioParam = params.get('anio')
    const mesParam = params.get('mes')
    const vendedorIdParam = params.get('vendedorId')

    const anio = anioParam ? parseInt(anioParam, 10) : undefined
    const mes = mesParam ? parseInt(mesParam, 10) : undefined

    if (anio !== undefined && (isNaN(anio) || anio < 2020 || anio > 2100)) {
      return NextResponse.json({ error: 'Año inválido' }, { status: 400 })
    }
    if (mes !== undefined && (isNaN(mes) || mes < 1 || mes > 12)) {
      return NextResponse.json({ error: 'Mes inválido (debe ser 1-12)' }, { status: 400 })
    }

    const conditions: ReturnType<typeof eq>[] = []

    if (ctx.role === 'agent') {
      conditions.push(eq(metas.vendedorId, ctx.userId))
    } else if (ctx.role === 'gerente') {
      const agentes = ctx.agentesVisibles
      if (agentes.length === 0) return NextResponse.json({ data: [] })
      if (vendedorIdParam && agentes.includes(vendedorIdParam)) {
        conditions.push(eq(metas.vendedorId, vendedorIdParam))
      } else {
        conditions.push(inArray(metas.vendedorId, agentes) as ReturnType<typeof eq>)
      }
    } else {
      // admin
      if (vendedorIdParam) conditions.push(eq(metas.vendedorId, vendedorIdParam))
    }

    if (anio !== undefined) conditions.push(eq(metas.periodoAnio, anio) as ReturnType<typeof eq>)
    if (mes !== undefined) conditions.push(eq(metas.periodoMes, mes) as ReturnType<typeof eq>)

    const rows = await db
      .select({ meta: metas, vendedorNombre: users.name })
      .from(metas)
      .leftJoin(users, eq(metas.vendedorId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(metas.periodoAnio, metas.periodoMes)

    const data = rows.map((r) => ({ ...r.meta, vendedorNombre: r.vendedorNombre ?? null }))
    return NextResponse.json({ data })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const ctx = await getSessionContext(session.user)

    if (ctx.role === 'agent') {
      throw new AuthzError('Los agentes no pueden crear metas')
    }

    const body: unknown = await req.json()
    const parsed = createMetaSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const input = parsed.data

    // Gerente can only create metas for agents in their territories
    if (ctx.role === 'gerente') {
      if (!ctx.agentesVisibles.includes(input.vendedorId)) {
        throw new AuthzError('Solo podés crear metas para agentes de tus territorios')
      }
    }

    const status = isMesBloqueable(input.periodoAnio, input.periodoMes)
    if (status === 'bloqueado_pasado') {
      return NextResponse.json({ error: 'No se pueden crear metas para períodos pasados' }, { status: 400 })
    }

    const existing = await getMetaByVendedorPeriodo(input.vendedorId, input.periodoAnio, input.periodoMes)
    if (existing) {
      return NextResponse.json(
        { error: `Ya existe una meta para este vendedor en ${input.periodoMes}/${input.periodoAnio}` },
        { status: 409 },
      )
    }

    const meta = await createMeta(
      {
        vendedorId: input.vendedorId,
        periodoAnio: input.periodoAnio,
        periodoMes: input.periodoMes,
        clientesNuevosObjetivo: input.clientesNuevosObjetivo,
        pedidosObjetivo: input.pedidosObjetivo,
        montoCobradoObjetivo: input.montoCobradoObjetivo,
        conversionLeadsObjetivo: input.conversionLeadsObjetivo,
      },
      session.user.id,
    )

    return NextResponse.json({ data: meta }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
