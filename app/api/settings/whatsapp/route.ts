import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { whatsappConfig } from '@/db/schema'
import { z } from 'zod'
import { withAdminAuth } from '@/lib/authz'
import { toApiError } from '@/lib/errors'

const updateWhatsappSchema = z.object({
  phoneNumberId: z.string().min(1, 'Requerido').max(50),
  accessToken: z.string().min(1, 'Requerido').max(500),
  appSecret: z.string().min(1, 'Requerido').max(200),
  verifyToken: z.string().min(1, 'Requerido').max(200),
})

export async function GET() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const config = await db.query.whatsappConfig.findFirst()

    // Enmascarar tokens sensibles en la respuesta
    if (config?.isConfigured) {
      return NextResponse.json({
        data: {
          ...config,
          accessToken: maskToken(config.accessToken),
          appSecret: maskToken(config.appSecret),
        },
      })
    }
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
      const parsed = updateWhatsappSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
          { status: 400 },
        )
      }

      const existing = await db.query.whatsappConfig.findFirst()

      // Si el token está enmascarado (viene del GET), mantenemos el valor existente
      const accessToken = isTokenMasked(parsed.data.accessToken)
        ? (existing?.accessToken ?? parsed.data.accessToken)
        : parsed.data.accessToken

      const appSecret = isTokenMasked(parsed.data.appSecret)
        ? (existing?.appSecret ?? parsed.data.appSecret)
        : parsed.data.appSecret

      const updates = {
        phoneNumberId: parsed.data.phoneNumberId,
        accessToken,
        appSecret,
        verifyToken: parsed.data.verifyToken,
        isConfigured: true,
        updatedBy: user.id,
        updatedAt: new Date(),
      }

      await db
        .insert(whatsappConfig)
        .values({ id: 1, ...updates })
        .onConflictDoUpdate({ target: whatsappConfig.id, set: updates })

      return NextResponse.json({ data: { isConfigured: true } })
    }, session.user)
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

function maskToken(token: string): string {
  if (!token || token.length < 8) return '••••••••'
  return `${token.slice(0, 4)}${'•'.repeat(token.length - 8)}${token.slice(-4)}`
}

function isTokenMasked(value: string): boolean {
  return value.includes('•')
}
