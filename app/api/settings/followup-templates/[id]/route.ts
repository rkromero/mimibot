import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { followUpTemplates } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  templateName: z.string().min(1).max(100).optional(),
  language: z.string().min(2).max(10).optional(),
  scenario: z.enum(['no_response', 'stalling', 'manual']).optional(),
  bodyPreview: z.string().max(1024).optional(),
  parameters: z.array(z.object({
    position: z.number().int().min(1),
    source: z.enum(['contact.name', 'lead.productInterest', 'lead.notes', 'custom']),
    value: z.string().optional(),
  })).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 })

  const existing = await db.query.followUpTemplates.findFirst({ where: eq(followUpTemplates.id, id) })
  if (!existing) return NextResponse.json({ error: 'Template no encontrado' }, { status: 404 })

  if (parsed.data.isDefault) {
    const scenario = parsed.data.scenario ?? existing.scenario
    await db.update(followUpTemplates)
      .set({ isDefault: false })
      .where(eq(followUpTemplates.scenario, scenario))
  }

  const [updated] = await db.update(followUpTemplates)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(followUpTemplates.id, id))
    .returning()

  return NextResponse.json(updated)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  await db.delete(followUpTemplates).where(eq(followUpTemplates.id, id))
  return NextResponse.json({ ok: true })
}
