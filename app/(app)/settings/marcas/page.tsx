import { db } from '@/db'
import { usuarioMarcas } from '@/db/schema'
import { inArray } from 'drizzle-orm'
import MarcasManager from './MarcasManager'

export default async function MarcasPage() {
  const [marcasList, ventasUsers] = await Promise.all([
    db.query.marcas.findMany({
      orderBy: (m, { desc, asc }) => [desc(m.esDefault), asc(m.nombre)],
    }),
    db.query.users.findMany({
      where: (u, { and, inArray: inA, eq }) =>
        and(inA(u.role, ['agent', 'vendedor', 'rtv']), eq(u.isActive, true)),
      columns: { id: true, name: true, email: true, role: true },
      orderBy: (u, { asc }) => [asc(u.name)],
    }),
  ])

  const userIds = ventasUsers.map((u) => u.id)
  const asignaciones = userIds.length > 0
    ? await db
        .select({ usuarioId: usuarioMarcas.usuarioId, marcaId: usuarioMarcas.marcaId })
        .from(usuarioMarcas)
        .where(inArray(usuarioMarcas.usuarioId, userIds))
    : []

  const initialAsignaciones: Record<string, string[]> = {}
  for (const a of asignaciones) {
    (initialAsignaciones[a.usuarioId] ??= []).push(a.marcaId)
  }

  return (
    <MarcasManager
      initialMarcas={marcasList.map((m) => ({
        id: m.id,
        nombre: m.nombre,
        slug: m.slug,
        activo: m.activo,
        esDefault: m.esDefault,
      }))}
      ventasUsers={ventasUsers}
      initialAsignaciones={initialAsignaciones}
    />
  )
}
