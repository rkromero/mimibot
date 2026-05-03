import { NextResponse } from 'next/server'
import { db } from '@/db'
import { sql } from 'drizzle-orm'

export async function GET() {
  let dbStatus = 'disconnected'
  try {
    await db.execute(sql`SELECT 1`)
    dbStatus = 'connected'
  } catch {
    // DB no disponible — el proceso sigue respondiendo
  }
  return NextResponse.json({ status: 'ok', db: dbStatus })
}
