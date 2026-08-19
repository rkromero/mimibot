import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { recetas, recetaItems } from '@/db/schema'
import { eq, asc } from 'drizzle-orm'
import { requireAdmin } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { createRecetaSchema } from '@/lib/validations/cotizador'
import { validarItemsKg } from '@/lib/cotizador/validar-items'

export async function GET() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    requireAdmin(session.user)

    const data = await db.query.recetas.findMany({
      with: { items: { with: { insumo: true } } },
      orderBy: asc(recetas.gramaje),
    })

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
    requireAdmin(session.user)

    const body: unknown = await req.json()
    const parsed = createRecetaSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const existente = await db.query.recetas.findFirst({
      where: eq(recetas.gramaje, parsed.data.gramaje),
      columns: { id: true },
    })
    if (existente) {
      return NextResponse.json({ error: `Ya existe una receta de ${parsed.data.gramaje} g` }, { status: 409 })
    }

    await validarItemsKg(parsed.data.items)

    const receta = await db.transaction(async (tx) => {
      const [nueva] = await tx.insert(recetas).values({ gramaje: parsed.data.gramaje }).returning()
      if (parsed.data.items.length > 0) {
        await tx.insert(recetaItems).values(
          parsed.data.items.map((item) => ({
            recetaId: nueva!.id,
            insumoId: item.insumoId,
            gramos: item.gramos.toFixed(2),
          })),
        )
      }
      return nueva
    })

    return NextResponse.json({ data: receta }, { status: 201 })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
