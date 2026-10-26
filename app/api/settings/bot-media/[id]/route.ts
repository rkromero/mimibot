export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { attachments, botMedia } from '@/db/schema'
import { withAdminAuth } from '@/lib/authz'
import { toApiError, NotFoundError } from '@/lib/errors'
import { validateUuidParam } from '@/lib/api/validate-params'
import { r2Client, R2_BUCKET } from '@/lib/r2/client'

const patchSchema = z.object({
  titulo: z.string().trim().min(1).max(120).optional(),
  descripcion: z.string().trim().max(500).nullable().optional(),
  orden: z.number().int().min(0).max(999).optional(),
  activo: z.boolean().optional(),
})

type Ctx = { params: Promise<{ id: string }> }

/** Título, descripción, orden o activo. Solo admin. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid

    return await withAdminAuth(async () => {
      const body: unknown = await req.json()
      const parsed = patchSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
      }
      const [row] = await db
        .update(botMedia)
        .set({
          ...(parsed.data.titulo !== undefined ? { titulo: parsed.data.titulo } : {}),
          ...(parsed.data.descripcion !== undefined ? { descripcion: parsed.data.descripcion || null } : {}),
          ...(parsed.data.orden !== undefined ? { orden: parsed.data.orden } : {}),
          ...(parsed.data.activo !== undefined ? { activo: parsed.data.activo } : {}),
        })
        .where(eq(botMedia.id, id))
        .returning()
      if (!row) throw new NotFoundError('Medio')
      return NextResponse.json({ data: row })
    }, session.user)
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

/**
 * Saca el medio de la galería. El archivo en R2 se borra solo si ningún
 * mensaje ya enviado lo referencia (si no, la foto desaparecería del chat).
 */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const { id } = await params
    const invalid = validateUuidParam(id)
    if (invalid) return invalid

    return await withAdminAuth(async () => {
      const [row] = await db.delete(botMedia).where(eq(botMedia.id, id)).returning({ r2Key: botMedia.r2Key })
      if (!row) throw new NotFoundError('Medio')

      const usado = await db.query.attachments.findFirst({
        where: eq(attachments.r2Key, row.r2Key),
        columns: { id: true },
      })
      if (!usado) {
        try {
          await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: row.r2Key }))
        } catch (err) {
          console.warn('[bot-media] no se pudo borrar el archivo de R2:', err)
        }
      }
      return NextResponse.json({ ok: true })
    }, session.user)
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
