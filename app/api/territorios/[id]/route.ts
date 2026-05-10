import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { updateTerritorioSchema } from '@/lib/validations/territorios'
import {
  getTerritorio,
  editarTerritorio,
  darDeBajaTerritorio,
  getAgenteActivo,
} from '@/lib/territorios/territorios.service'
import { getSessionContext } from '@/lib/territorios/context'
import { db } from '@/db'
import { territorioGerente, users, clientes } from '@/db/schema'
import { eq, and, isNull, count } from 'drizzle-orm'

type RouteCtx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteCtx) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    if (session.user.role === 'agent') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const ctx = await getSessionContext(session.user)
    const { id } = await params
    const t = await getTerritorio(id, ctx)

    // Enrich with agente activo
    const agenteRow = await getAgenteActivo(id)
    let agente: { id: string; name: string | null; avatarColor: string } | null = null
    if (agenteRow) {
      const u = await db.query.users.findFirst({
        where: eq(users.id, agenteRow.agenteId),
        columns: { id: true, name: true, avatarColor: true },
      })
      agente = u ?? null
    }

    // Enrich with gerentes
    const gerentesRows = await db.query.territorioGerente.findMany({
      where: eq(territorioGerente.territorioId, id),
      columns: { gerenteId: true },
    })
    const gerentes = (await Promise.all(
      gerentesRows.map((g) =>
        db.query.users.findFirst({
          where: eq(users.id, g.gerenteId),
          columns: { id: true, name: true, avatarColor: true },
        }),
      ),
    )).filter(Boolean)

    const [cantRow] = await db
      .select({ value: count() })
      .from(clientes)
      .where(and(eq(clientes.territorioId, id), isNull(clientes.deletedAt)))

    return NextResponse.json({
      data: {
        ...t,
        sinAgente: !agenteRow,
        agente,
        gerentes,
        cantClientes: cantRow?.value ?? 0,
      },
    })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function PUT(req: NextRequest, { params }: RouteCtx) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    requireAdmin(session.user)

    const { id } = await params
    const body: unknown = await req.json()
    const parsed = updateTerritorioSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const updated = await editarTerritorio(id, parsed.data)
    return NextResponse.json({ data: updated })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteCtx) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    requireAdmin(session.user)

    const { id } = await params
    await darDeBajaTerritorio(id)
    return NextResponse.json({ data: { ok: true } })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
