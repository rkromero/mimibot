import { db } from '@/db'
import { sql } from 'drizzle-orm'

// Asigna al agente activo con menos leads abiertos (least-loaded round-robin)
export async function assignNextAgent(): Promise<string | null> {
  const result = await db.execute(sql`
    SELECT u.id
    FROM users u
    WHERE u.role = 'agent' AND u.is_active = true
    ORDER BY (
      SELECT COUNT(*) FROM leads l
      WHERE l.assigned_to = u.id AND l.is_open = true
    ) ASC
    LIMIT 1
  `)
  const rows = result as unknown as Array<{ id: string }>
  return rows[0]?.id ?? null
}
