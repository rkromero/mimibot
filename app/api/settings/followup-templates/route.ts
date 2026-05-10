import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { followUpTemplates } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const templateSchema = z.object({
  name: z.string().min(1).max(100),
  templateName: z.string().min(1).max(100),
  language: z.string().min(2).max(10).default('es'),
  scenario: z.enum(['no_response', 'stalling', 'manual']).default('no_response'),
  bodyPreview: z.string().max(1024).default(''),
  parameters: z.array(z.object({
    position: z.number().int().min(1),
    source: z.enum(['contact.name', 'lead.productInterest', 'lead.notes', 'custom']),
    value: z.string().optional(),
  })).default([]),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const templates = await db.query.followUpTemplates.findMany({
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  })
  return NextResponse.json(templates)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const parsed = templateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 })

  // Si es default, quitar default de los otros del mismo escenario
  if (parsed.data.isDefault) {
    await db.update(followUpTemplates)
      .set({ isDefault: false })
      .where(eq(followUpTemplates.scenario, parsed.data.scenario))
  }

  const [created] = await db.insert(followUpTemplates)
    .values({ ...parsed.data, createdAt: new Date(), updatedAt: new Date() })
    .returning()

  return NextResponse.json(created, { status: 201 })
}
