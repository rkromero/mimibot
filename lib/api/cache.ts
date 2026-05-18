import { createHash } from 'crypto'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

// Returns a 304 if ETag matches, otherwise a 200 with Cache-Control + ETag.
export function cachedJson(req: NextRequest, payload: unknown): NextResponse {
  const body = JSON.stringify(payload)
  const etag = `"${createHash('md5').update(body).digest('hex')}"`

  if (req.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } })
  }

  const res = NextResponse.json(payload)
  res.headers.set('Cache-Control', 'private, max-age=60, must-revalidate')
  res.headers.set('ETag', etag)
  return res
}
