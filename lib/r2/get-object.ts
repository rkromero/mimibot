import { GetObjectCommand } from '@aws-sdk/client-s3'
import { r2Client, R2_BUCKET } from './client'

/** Baja un objeto de R2 completo a memoria (archivos chicos: fotos, PDFs). */
export async function getObjectBuffer(key: string): Promise<{ buffer: Buffer; contentType: string | null }> {
  const res = await r2Client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }))
  const bytes = await res.Body?.transformToByteArray()
  if (!bytes || bytes.length === 0) throw new Error(`El archivo ${key} está vacío o no existe en R2`)
  return { buffer: Buffer.from(bytes), contentType: res.ContentType ?? null }
}
