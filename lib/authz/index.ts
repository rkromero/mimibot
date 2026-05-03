import { eq, and } from 'drizzle-orm'
import { db } from '@/db'
import { leads } from '@/db/schema'
import { AuthzError } from '@/lib/errors'
import type { Session } from 'next-auth'

type SessionUser = Session['user']

export async function canAccessLead(user: SessionUser, leadId: string): Promise<void> {
  if (user.role === 'admin') return

  const lead = await db.query.leads.findFirst({
    where: and(
      eq(leads.id, leadId),
      eq(leads.assignedTo, user.id),
    ),
    columns: { id: true },
  })

  if (!lead) throw new AuthzError('No tenés acceso a este lead')
}

export function requireAdmin(user: SessionUser): void {
  if (user.role !== 'admin') {
    throw new AuthzError('Solo los administradores pueden realizar esta acción')
  }
}

// Wrapper para handlers de API que requieren sesión
export async function withAuth<T>(
  handler: (user: SessionUser) => Promise<T>,
  user: SessionUser | undefined,
): Promise<T> {
  if (!user) throw new AuthzError('Sesión requerida')
  return handler(user)
}

// Wrapper para handlers que requieren rol admin
export async function withAdminAuth<T>(
  handler: (user: SessionUser) => Promise<T>,
  user: SessionUser | undefined,
): Promise<T> {
  if (!user) throw new AuthzError('Sesión requerida')
  requireAdmin(user)
  return handler(user)
}
