import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { anthropic, BOT_MODEL } from '@/lib/claude/client'
import { z } from 'zod'
import { toApiError } from '@/lib/errors'

const HANDOFF_MARKER = '[HANDOFF]'

const schema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(2000),
  })).min(1).max(50),
  systemPrompt: z.string().min(1).max(8000),
})

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body: unknown = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const { messages, systemPrompt } = parsed.data

    const result = await anthropic.messages.create({
      model: BOT_MODEL,
      max_tokens: 512,
      system: systemPrompt,
      messages,
    })

    const raw = result.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    const handoff = raw.includes(HANDOFF_MARKER)
    const text = raw.replace(HANDOFF_MARKER, '').trim()

    return NextResponse.json({ response: text, handoff })
  } catch (err) {
    console.error('[bot/preview]', err)
    const { message, status } = toApiError(err)
    const detail = err instanceof Error ? err.message : undefined
    return NextResponse.json({ error: message, detail }, { status })
  }
}
