import { S3Client } from '@aws-sdk/client-s3'

if (!process.env['R2_ACCOUNT_ID'] || !process.env['R2_ACCESS_KEY_ID'] || !process.env['R2_SECRET_ACCESS_KEY']) {
  // No lanzamos error en build time, solo en runtime cuando se usa
  console.warn('[r2] Credenciales de R2 no configuradas')
}

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env['R2_ACCESS_KEY_ID'] ?? '',
    secretAccessKey: process.env['R2_SECRET_ACCESS_KEY'] ?? '',
  },
})

export const R2_BUCKET = process.env['R2_BUCKET_NAME'] ?? 'crm-media'
