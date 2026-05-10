import { db } from '@/db'
import { documentCounters } from '@/db/schema'

await db.insert(documentCounters).values([
  { tipo: 'remito', lastNumber: 0 },
  { tipo: 'proforma', lastNumber: 0 },
]).onConflictDoNothing()

console.log('document_counters seeded')
