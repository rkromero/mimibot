import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { followUpConfig } from '@/db/schema'
import { z } from 'zod'

const configSchema = z.object({
  isEnabled: z.boolean().optional(),
  noResponseHours: z.number().int().min(1).max(720).optional(),
  stallingDelayMinutes: z.number().int().min(1).max(1440).optional(),
  maxFollowUps: z.number().int().min(1).max(10).optional(),
  retryHours: z.array(z.number().int().min(1)).min(1).max(5).optional(),
  stallingPhrases: z.array(z.string().min(1).max(100)).max(30).optional(),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const config = await db.query.followUpConfig.findFirst()
  return NextResponse.json(config ?? {
    isEnabled: true,
    noResponseHours: 24,
    stallingDelayMinutes: 60,
    maxFollowUps: 3,
    retryHours: [1, 22, 72],
    stallingPhrases: [],
  })
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const parsed = configSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 })

  const [updated] = await db.insert(followUpConfig)
    .values({ id: 1, ...parsed.data, updatedAt: new Date() })
    .onConflictDoUpdate({ target: followUpConfig.id, set: { ...parsed.data, updatedAt: new Date() } })
    .returning()

  return NextResponse.json(updated)
}
