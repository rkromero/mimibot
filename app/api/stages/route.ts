import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pipelineStages } from '@/db/schema'
import { asc, sql } from 'drizzle-orm'
import { z } from 'zod'
import { withAdminAuth } from '@/lib/authz'
import { toApiError } from '@/lib/errors'

const createStageSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6b7280'),
})

export async function GET() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const stages = await db.query.pipelineStages.findMany({
      orderBy: [asc(pipelineStages.position)],
    })
    return NextResponse.json({ data: stages })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    return withAdminAuth(async () => {
      const body: unknown = await req.json()
      const parsed = createStageSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 })
      }

      // Insertar al final del pipeline
      const result = await db.execute(
        sql`SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM pipeline_stages`,
      )
      const nextPos = (result as unknown as Array<{ next_pos: number }>)[0]?.next_pos ?? 0

      const slug = parsed.data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')

      const [stage] = await db
        .insert(pipelineStages)
        .values({
          name: parsed.data.name,
          slug: `${slug}-${Date.now()}`,
          position: nextPos,
          color: parsed.data.color,
          isDeletable: true,
          isTerminal: false,
        })
        .returning()

      return NextResponse.json({ data: stage }, { status: 201 })
    }, session.user)
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
