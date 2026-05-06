import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { scheduleFollowUp, cancelFollowUp } from '@/lib/followup/engine'
import { z } from 'zod'

const scheduleSchema = z.object({
  reason: z.enum(['no_response', 'stalling', 'manual']).default('manual'),
  delayMinutes: z.number().int().min(1).optional(),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leadId: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { leadId } = await params
  const body = await req.json()
  const parsed = scheduleSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  await scheduleFollowUp(leadId, parsed.data.reason, parsed.data.delayMinutes)
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ leadId: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { leadId } = await params
  await cancelFollowUp(leadId)
  return NextResponse.json({ ok: true })
}
