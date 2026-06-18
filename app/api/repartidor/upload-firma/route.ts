import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { r2Client, R2_BUCKET } from '@/lib/r2/client'
import { toApiError, AuthzError } from '@/lib/errors'
import { esRolReparto } from '@/lib/authz/roles'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const role = session.user.role
    if (!esRolReparto(role) && role !== 'admin' && role !== 'gerente' && role !== 'fabrica') {
      throw new AuthzError('Solo repartidor, fabrica, admin o gerente pueden subir firmas')
    }

    // Pre-flight: verify R2 credentials are present before attempting upload
    const missingVars = (
      ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'] as const
    ).filter((v) => !process.env[v])
    if (missingVars.length > 0) {
      console.error('[upload-firma] R2 credentials missing:', missingVars)
      return NextResponse.json(
        { error: `Almacenamiento no configurado — variables faltantes: ${missingVars.join(', ')}` },
        { status: 503 },
      )
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })
    if (file.size === 0) return NextResponse.json({ error: 'El archivo está vacío' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const rand = Math.random().toString(36).slice(2, 8)
    const key = `firmas/${Date.now()}-${rand}.png`

    try {
      await r2Client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: 'image/png',
        }),
      )
    } catch (r2Err) {
      const awsCode =
        (r2Err as { Code?: string }).Code ??
        (r2Err as { name?: string }).name ??
        'Unknown'
      const httpStatus =
        (r2Err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      const msg = (r2Err as Error).message ?? ''

      console.error('[upload-firma] R2 PutObject error', {
        code: awsCode,
        httpStatus,
        bucket: R2_BUCKET,
        message: msg,
      })

      if (awsCode === 'NoSuchBucket')
        return NextResponse.json({ error: `Bucket R2 '${R2_BUCKET}' no existe — verificar R2_BUCKET_NAME` }, { status: 503 })
      if (awsCode === 'AccessDenied' || httpStatus === 403)
        return NextResponse.json({ error: 'Acceso denegado a R2 — verificar credenciales' }, { status: 503 })
      if (msg.includes('EPROTO') || msg.includes('SSL') || msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND'))
        return NextResponse.json({ error: `Error de conexión a R2 (${awsCode}) — verificar R2_ACCOUNT_ID y red` }, { status: 503 })

      // Re-throw so toApiError handles + logs it
      throw r2Err
    }

    return NextResponse.json({ r2Key: key })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
