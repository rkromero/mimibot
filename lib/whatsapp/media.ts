import { PutObjectCommand } from '@aws-sdk/client-s3'
import { r2Client, R2_BUCKET } from '@/lib/r2/client'
import { downloadMediaFromMeta } from './client'
import { db } from '@/db'
import { attachments, messages } from '@/db/schema'
import { ext } from './mime'

// Descarga un media de Meta, lo sube a R2, y guarda el attachment en DB
export async function persistInboundMedia(params: {
  waMediaId: string
  messageId: string
  conversationId: string
  mimeType: string
  filename?: string | null
}): Promise<void> {
  const { waMediaId, messageId, conversationId, mimeType, filename } = params

  const { buffer } = await downloadMediaFromMeta(waMediaId)

  const extension = ext(mimeType)
  const r2Key = `wa-media/${conversationId}/${messageId}.${extension}`

  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: r2Key,
      Body: buffer,
      ContentType: mimeType,
    }),
  )

  await db.insert(attachments).values({
    messageId,
    waMediaId,
    r2Key,
    mimeType,
    fileSize: buffer.length,
    originalFilename: filename ?? null,
  })
}

// Sube un buffer enviado por el agente a R2
export async function persistOutboundMedia(params: {
  buffer: Buffer
  messageId: string
  conversationId: string
  mimeType: string
  filename: string
}): Promise<string> {
  const { buffer, messageId, conversationId, mimeType, filename } = params
  const extension = ext(mimeType)
  const r2Key = `wa-media/${conversationId}/${messageId}.${extension}`

  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: r2Key,
      Body: buffer,
      ContentType: mimeType,
    }),
  )

  await db.insert(attachments).values({
    messageId,
    r2Key,
    mimeType,
    fileSize: buffer.length,
    originalFilename: filename,
  })

  return r2Key
}
