import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { r2Client, R2_BUCKET } from '@/lib/r2/client'
import { toApiError, AuthzError } from '@/lib/errors'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const role = session.user.role
    if (role !== 'repartidor' && role !== 'admin' && role !== 'gerente') {
      throw new AuthzError('Solo repartidor, admin o gerente pueden subir firmas')
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const rand = Math.random().toString(36).slice(2, 8)
    const key = `firmas/${Date.now()}-${rand}.png`

    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: 'image/png',
      }),
    )

    return NextResponse.json({ r2Key: key })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
