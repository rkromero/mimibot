import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/db'
import { empresaConfig } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { toApiError, AuthzError, ValidationError } from '@/lib/errors'

const DEFAULT_CONFIG = {
  id: 1,
  nombre: '',
  direccion: null,
  telefono: null,
  email: null,
  updatedBy: null,
  updatedAt: new Date(),
}

export async function GET(_req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const [config] = await db
      .select()
      .from(empresaConfig)
      .where(eq(empresaConfig.id, 1))
      .limit(1)

    return NextResponse.json({ data: config ?? DEFAULT_CONFIG })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      throw new AuthzError('Solo los administradores pueden modificar la configuración de empresa')
    }

    const body: unknown = await req.json()
    const data = body as Record<string, unknown>

    // Validate required field
    if (data.nombre !== undefined && typeof data.nombre !== 'string') {
      throw new ValidationError('El nombre debe ser un texto')
    }
    if (data.nombre !== undefined && (data.nombre as string).trim() === '') {
      throw new ValidationError('El nombre de la empresa no puede estar vacío')
    }

    const updates: Partial<typeof empresaConfig.$inferInsert> = {
      updatedBy: session.user.id,
      updatedAt: new Date(),
    }

    if (typeof data.nombre === 'string') updates.nombre = data.nombre.trim()
    if (data.direccion === null || typeof data.direccion === 'string') {
      updates.direccion = data.direccion as string | null
    }
    if (data.telefono === null || typeof data.telefono === 'string') {
      updates.telefono = data.telefono as string | null
    }
    if (data.email === null || typeof data.email === 'string') {
      updates.email = data.email as string | null
    }

    // Upsert: insert if not exists, update if exists
    const [result] = await db
      .insert(empresaConfig)
      .values({
        id: 1,
        nombre: (updates.nombre as string) ?? '',
        direccion: updates.direccion ?? null,
        telefono: updates.telefono ?? null,
        email: updates.email ?? null,
        updatedBy: session.user.id,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: empresaConfig.id,
        set: updates,
      })
      .returning()

    return NextResponse.json({ data: result })
  } catch (err) {
    const { message, status } = toApiError(err)
    return NextResponse.json({ error: message }, { status })
  }
}
