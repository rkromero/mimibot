import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { processFollowUps } from '@/lib/followup/engine'

// Puede llamarse desde un cron job (Vercel Cron) o manualmente por un admin
export async function POST(req: Request) {
  // Soporte para llamadas de cron con secret header
  const cronSecret = process.env['CRON_SECRET']
  const authHeader = req.headers.get('authorization')

  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      const session = await auth()
      if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
  } else {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const result = await processFollowUps()
  return NextResponse.json(result)
}
