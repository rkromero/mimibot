import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl as awsGetSignedUrl } from '@aws-sdk/s3-request-presigner'
import { r2Client, R2_BUCKET } from './client'

export async function getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: R2_BUCKET, Key: key })
  return awsGetSignedUrl(r2Client, command, { expiresIn: expiresInSeconds })
}
