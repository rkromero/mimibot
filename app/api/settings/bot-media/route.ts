export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { asc } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { botMedia } from '@/db/schema'
import { withAdminAuth } from '@/lib/authz'
import { toApiError, ValidationError } from '@/lib/errors'
import { r2Client, R2_BUCKET } from '@/lib/r2/client'
import { adaptarImagenParaMeta } from '@/lib/whatsapp/imagen-meta'
import { contentTypeFromExt, ext } from '@/lib/whatsapp/mime'
import { esCategoriaBotMedia } from '@/lib/claude/bot-reglas'

const MAX_IMAGEN_BYTES = 5 * 1024 * 1024
const MAX_VIDEO_BYTES = 16 * 1024 * 1024

/** Galería completa (activos e inactivos), ordenada por categoría y orden. */
export async function GET() {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const data = await db.query.botMedia.findMany({
      orderBy: [asc(botMedia.categoria), asc(botMedia.orden), asc(botMedia.createdAt)],
    })
    return NextResponse.json({ data })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

/** Sube una foto (jpg/png/webp) o un video mp4 a R2 y la agrega a la galería. Solo admin. */
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    return await withAdminAuth(async (user) => {
      const formData = await req.formData()
      const file = formData.get('file')
      const categoria = String(formData.get('categoria') ?? '')
      const titulo = String(formData.get('titulo') ?? '').trim().slice(0, 120)
      const descripcion = String(formData.get('descripcion') ?? '').trim().slice(0, 500)

      if (!(file instanceof File)) throw new ValidationError('Falta el archivo')
      if (!esCategoriaBotMedia(categoria)) throw new ValidationError('Categoría inválida')
      if (!titulo) throw new ValidationError('Poné un título corto (es el epígrafe que ve el cliente)')

      const mimeOriginal = file.type || contentTypeFromExt(file.name)
      const esVideo = mimeOriginal === 'video/mp4'
      const esImagen = mimeOriginal.startsWith('image/')
      if (!esVideo && !esImagen) throw new ValidationError('Solo se aceptan fotos (JPG, PNG, WebP) o videos MP4')

      const crudo = Buffer.from(await file.arrayBuffer())
      if (crudo.length === 0) throw new ValidationError('El archivo está vacío')
      if (esVideo && crudo.length > MAX_VIDEO_BYTES) throw new ValidationError('El video no puede superar los 16 MB')
      if (esImagen && crudo.length > MAX_IMAGEN_BYTES) throw new ValidationError('La foto no puede superar los 5 MB')

      // Meta solo acepta JPG/PNG como imagen: WebP y otros se convierten
      const { buffer, mimeType } = esImagen
        ? await adaptarImagenParaMeta({ buffer: crudo, mimeType: mimeOriginal, filename: file.name })
        : { buffer: crudo, mimeType: mimeOriginal }

      const r2Key = `bot-media/${categoria}/${randomUUID()}.${ext(mimeType)}`
      await r2Client.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: r2Key, Body: buffer, ContentType: mimeType }))

      const [row] = await db
        .insert(botMedia)
        .values({
          categoria,
          titulo,
          descripcion: descripcion || null,
          r2Key,
          mimeType,
          fileSize: buffer.length,
          createdBy: user.id,
        })
        .returning()

      return NextResponse.json({ data: row }, { status: 201 })
    }, session.user)
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
