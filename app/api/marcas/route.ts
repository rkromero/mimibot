import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { marcas } from '@/db/schema'
import { eq, asc, desc } from 'drizzle-orm'
import { createMarcaSchema } from '@/lib/validations/marcas'
import { withAdminAuth } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { slugify } from '@/lib/utils'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const soloActivas = req.nextUrl.searchParams.get('soloActivas') === 'true'

    const rows = await db
      .select({
        id: marcas.id,
        nombre: marcas.nombre,
        slug: marcas.slug,
        activo: marcas.activo,
        esDefault: marcas.esDefault,
      })
      .from(marcas)
      // Default (Mimi) primero, luego alfabético
      .orderBy(desc(marcas.esDefault), asc(marcas.nombre))

    const data = soloActivas ? rows.filter((m) => m.activo) : rows
    return NextResponse.json({ data })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

function getPgCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined
  const e = err as Record<string, unknown>
  if (typeof e['code'] === 'string') return e['code']
  const cause = e['cause']
  if (cause && typeof cause === 'object') {
    const c = cause as Record<string, unknown>
    if (typeof c['code'] === 'string') return c['code']
  }
  return undefined
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    return await withAdminAuth(async () => {
      const body: unknown = await req.json()
      const parsed = createMarcaSchema.safeParse(body)
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? 'Datos inválidos'
        return NextResponse.json({ error: message }, { status: 400 })
      }

      const nombre = parsed.data.nombre
      const baseSlug = slugify(nombre) || 'marca'

      // El slug es único: si choca, probamos sufijos -2, -3, … hasta encajar.
      let marca: typeof marcas.$inferSelect | undefined
      for (let attempt = 0; attempt < 10; attempt++) {
        const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`
        try {
          const [row] = await db
            .insert(marcas)
            .values({ nombre, slug, activo: true, esDefault: false })
            .returning()
          marca = row
          break
        } catch (insertErr) {
          if (getPgCode(insertErr) === '23505') continue // slug duplicado, reintentar
          throw insertErr
        }
      }

      if (!marca) {
        return NextResponse.json({ error: 'No se pudo generar un slug único, intentá con otro nombre' }, { status: 409 })
      }

      return NextResponse.json({ data: marca }, { status: 201 })
    }, session.user)
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
