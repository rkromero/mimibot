/**
 * Backfill del barrio oficial (USIG/GCBA) para clientes de CABA ya cargados.
 *
 * Recorre los clientes activos de CABA con dirección y sin barrio, resuelve el
 * barrio oficial con el mismo cliente USIG que usa el alta, y lo guarda.
 * Nunca pisa un barrio ya cargado (guarda también en el WHERE del UPDATE).
 * Idempotente: una segunda corrida no encuentra candidatos.
 *
 * Uso:
 *   npx tsx scripts/backfill-barrios-caba.ts            → aplica los cambios
 *   npx tsx scripts/backfill-barrios-caba.ts --dry-run  → solo reporta
 */

import 'dotenv/config'
import { and, eq, isNull, isNotNull, sql } from 'drizzle-orm'
import { db } from '@/db'
import { clientes } from '@/db/schema'
import { esProvinciaCABA } from '@/lib/validations/clientes'
import { obtenerBarrioOficialCABA } from '@/lib/geo/usig'

const DRY_RUN = process.argv.includes('--dry-run')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  console.log(`\n=== Backfill barrios CABA (USIG) — modo: ${DRY_RUN ? 'DRY-RUN (sin cambios)' : 'APPLY'} ===\n`)

  const candidatos = await db.query.clientes.findMany({
    where: and(
      isNull(clientes.deletedAt),
      isNotNull(clientes.direccion),
      sql`(${clientes.barrio} IS NULL OR btrim(${clientes.barrio}) = '')`,
    ),
    columns: { id: true, nombre: true, apellido: true, direccion: true, localidad: true, provincia: true },
  })

  // CABA se identifica por el campo provincia (regla de negocio)
  const deCaba = candidatos.filter((c) => esProvinciaCABA(c.provincia))

  console.log(`Clientes activos con dirección y sin barrio: ${candidatos.length} — de CABA: ${deCaba.length}\n`)

  let resueltos = 0
  let sinResultado = 0

  for (const c of deCaba) {
    const nombre = `${c.nombre} ${c.apellido ?? ''}`.trim()
    const barrio = await obtenerBarrioOficialCABA(c.direccion!)

    if (!barrio) {
      sinResultado++
      console.log(`  × ${nombre} — "${c.direccion}": USIG sin resultado (queda para carga manual)`)
    } else {
      resueltos++
      if (!DRY_RUN) {
        await db
          .update(clientes)
          .set({ barrio, updatedAt: new Date() })
          .where(and(
            eq(clientes.id, c.id),
            sql`(${clientes.barrio} IS NULL OR btrim(${clientes.barrio}) = '')`,
          ))
      }
      console.log(`  ${DRY_RUN ? '○' : '✔'} ${nombre} — "${c.direccion}" → ${barrio}`)
    }

    // Pausa corta entre clientes para no saturar el servicio público de USIG
    await sleep(150)
  }

  console.log(
    `\n${DRY_RUN ? 'ℹ️  DRY-RUN: no se escribió nada.' : '✅  Listo.'} ` +
    `Barrios resueltos: ${resueltos}, sin resultado: ${sinResultado}, clientes CABA procesados: ${deCaba.length}.\n`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error fatal:', err)
    process.exit(1)
  })
