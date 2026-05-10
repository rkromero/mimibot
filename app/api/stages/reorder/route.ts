import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { pipelineStages } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { withAdminAuth } from '@/lib/authz'
import { toApiError } from '@/lib/errors'

const reorderSchema = z.object({
  order: z.array(z.object({
    id: z.string().uuid(),
    position: z.number().int().min(0),
  })),
})

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    return withAdminAuth(async () => {
      const body: unknown = await req.json()
      const parsed = reorderSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 })
      }

      await Promise.all(
        parsed.data.order.map(({ id, position }) =>
          db.update(pipelineStages)
            .set({ position, updatedAt: new Date() })
            .where(eq(pipelineStages.id, id)),
        ),
      )

      return NextResponse.json({ ok: true })
    }, session.user)
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
