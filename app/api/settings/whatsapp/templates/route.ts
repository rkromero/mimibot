import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { whatsappTemplates } from '@/db/schema'
import { z } from 'zod'
import { withAdminAuth } from '@/lib/authz'
import { toApiError } from '@/lib/errors'
import { createMetaTemplate } from '@/lib/whatsapp/templates'
import { desc, eq } from 'drizzle-orm'

const createTemplateSchema = z.object({
  name: z.string().regex(/^[a-z0-9_]+$/, 'Solo letras minúsculas, números y guión bajo'),
  language: z.string().min(2, 'Requerido'),
  category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
  bodyText: z.string().min(1, 'Requerido'),
  headerText: z.string().optional(),
  footerText: z.string().optional(),
  buttons: z.array(z.record(z.unknown())).optional(),
  variables: z.array(z.object({
    index: z.number().int().min(1),
    source: z.string().min(1),
    sample: z.string(),
  })).optional(),
})

export async function GET() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const templates = await db
      .select()
      .from(whatsappTemplates)
      .orderBy(desc(whatsappTemplates.createdAt))

    return NextResponse.json({ data: templates })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    return withAdminAuth(async (user) => {
      const body: unknown = await req.json()
      const parsed = createTemplateSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
          { status: 400 },
        )
      }

      const { name, language, category, bodyText, headerText, footerText, buttons, variables } = parsed.data

      const [row] = await db
        .insert(whatsappTemplates)
        .values({
          name,
          language,
          category,
          bodyText,
          headerText: headerText ?? null,
          footerText: footerText ?? null,
          buttons: (buttons ?? []) as object[],
          variables: (variables ?? []) as object[],
          status: 'PENDING',
          createdBy: user.id,
        })
        .returning()

      if (!row) {
        return NextResponse.json({ error: 'Error al crear plantilla' }, { status: 500 })
      }

      let metaResult: { id: string; status: string; category: string }
      try {
        metaResult = await createMetaTemplate({ name, language, category, bodyText, headerText, footerText, variables })
      } catch (metaErr) {
        await db.delete(whatsappTemplates).where(eq(whatsappTemplates.id, row.id))
        const msg = metaErr instanceof Error ? metaErr.message : 'Error al registrar plantilla en Meta'
        return NextResponse.json({ error: msg }, { status: 400 })
      }

      const [updated] = await db
        .update(whatsappTemplates)
        .set({
          metaTemplateId: metaResult.id,
          status: metaResult.status,
          updatedAt: new Date(),
        })
        .where(eq(whatsappTemplates.id, row.id))
        .returning()

      return NextResponse.json({ data: updated }, { status: 201 })
    }, session.user)
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
