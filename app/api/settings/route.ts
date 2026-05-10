import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { botConfig } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { withAdminAuth } from '@/lib/authz'
import { toApiError } from '@/lib/errors'

const updateBotSchema = z.object({
  systemPrompt: z.string().min(10).max(8000).optional(),
  isEnabled: z.boolean().optional(),
  maxTurns: z.number().int().min(1).max(20).optional(),
  handoffPhrases: z.array(z.string().max(100)).max(20).optional(),
  qualificationQuestions: z.array(z.string()).optional(),
})

export async function GET() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const config = await db.query.botConfig.findFirst()
    return NextResponse.json({ data: config ?? null })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    return withAdminAuth(async (user) => {
      const body: unknown = await req.json()
      const parsed = updateBotSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 })
      }

      const updates: Partial<typeof botConfig.$inferInsert> = {
        updatedBy: user.id,
        updatedAt: new Date(),
      }
      if (parsed.data.systemPrompt !== undefined) updates.systemPrompt = parsed.data.systemPrompt
      if (parsed.data.isEnabled !== undefined) updates.isEnabled = parsed.data.isEnabled
      if (parsed.data.maxTurns !== undefined) updates.maxTurns = parsed.data.maxTurns
      if (parsed.data.handoffPhrases !== undefined) updates.handoffPhrases = parsed.data.handoffPhrases
      if (parsed.data.qualificationQuestions !== undefined) updates.qualificationQuestions = parsed.data.qualificationQuestions

      // Upsert — la tabla es singleton con id = 1
      await db
        .insert(botConfig)
        .values({ id: 1, systemPrompt: 'Sos un asistente de ventas.', ...updates })
        .onConflictDoUpdate({ target: botConfig.id, set: updates })

      const config = await db.query.botConfig.findFirst()
      return NextResponse.json({ data: config })
    }, session.user)
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
