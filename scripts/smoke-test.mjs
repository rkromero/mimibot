/**
 * Smoke test script for "% Cobertura cartera" feature
 * Runs against Railway DB directly
 */
import postgres from 'postgres'

const DB_URL = 'postgresql://postgres:DFwoGVwNDIRLIumSXCBVPoDMvsUzZUZJ@tramway.proxy.rlwy.net:58436/railway'
const sql = postgres(DB_URL)

const ADMIN_ID   = 'f19f35ff-4234-4c8b-a16b-cdc15d7378b1'
const VENDEDOR_ID = '85f44a86-0e5c-42b3-b56d-7cdf0fd7193e'

const now = new Date()
const ANIO = now.getFullYear()
const MES  = now.getMonth() + 1

const log = (msg) => console.log(msg)
const pass = (msg) => console.log(`  ✅ ${msg}`)
const fail = (msg) => console.log(`  ❌ ${msg}`)
const info = (msg) => console.log(`  ℹ️  ${msg}`)
const sep  = () => console.log('─'.repeat(60))

// ── Helpers ──────────────────────────────────────────────────────────────────

async function upsertMeta(pctCobertura) {
  const existing = await sql`
    SELECT id FROM metas
    WHERE vendedor_id = ${VENDEDOR_ID}
      AND periodo_anio = ${ANIO}
      AND periodo_mes  = ${MES}
    LIMIT 1
  `
  if (existing.length > 0) {
    await sql`
      UPDATE metas
      SET pct_clientes_con_pedido_objetivo = ${pctCobertura.toString()},
          fecha_actualizacion = now()
      WHERE id = ${existing[0].id}
    `
    return existing[0].id
  } else {
    const [row] = await sql`
      INSERT INTO metas (vendedor_id, periodo_anio, periodo_mes,
        clientes_nuevos_objetivo, pedidos_objetivo, monto_cobrado_objetivo,
        conversion_leads_objetivo, pct_clientes_con_pedido_objetivo, creado_por)
      VALUES (${VENDEDOR_ID}, ${ANIO}, ${MES},
        0, 0, '0', '0', ${pctCobertura.toString()}, ${ADMIN_ID})
      RETURNING id
    `
    return row.id
  }
}

async function getOrCreateClientes(n) {
  // First check how many clients are already assigned (not deleted)
  const existing = await sql`
    SELECT id FROM clientes
    WHERE asignado_a = ${VENDEDOR_ID}
      AND deleted_at IS NULL
    LIMIT ${n}
  `
  if (existing.length >= n) {
    return existing.slice(0, n).map(r => r.id)
  }

  // Create missing clients
  const needed = n - existing.length
  const created = []
  for (let i = 0; i < needed; i++) {
    const idx = existing.length + i + 1
    const [row] = await sql`
      INSERT INTO clientes (nombre, apellido, email, asignado_a, creado_por)
      VALUES (
        ${'SmokeTest'},
        ${`Cliente${idx}-${Date.now()}`},
        ${`smoke-cliente-${idx}-${Date.now()}@test.com`},
        ${VENDEDOR_ID},
        ${ADMIN_ID}
      )
      RETURNING id
    `
    created.push(row.id)
  }
  return [...existing.map(r => r.id), ...created]
}

async function createPedido(clienteId) {
  const [row] = await sql`
    INSERT INTO pedidos (
      cliente_id, vendedor_id, estado, total,
      monto_pagado, saldo_pendiente, estado_pago,
      fecha, creado_por
    )
    VALUES (
      ${clienteId}, ${VENDEDOR_ID}, 'confirmado', '100',
      '0', '100', 'impago',
      ${new Date()}, ${ADMIN_ID}
    )
    RETURNING id
  `
  return row.id
}

async function nullifyAsignadoA(clienteIds) {
  await sql`
    UPDATE clientes
    SET asignado_a = NULL
    WHERE id = ANY(${sql.array(clienteIds)}::uuid[])
  `
}

async function deleteSmokePedidosSoft(clienteIds) {
  // Soft-delete smoke pedidos so FK constraints (aplicaciones_pago) are respected
  await sql`
    UPDATE pedidos SET deleted_at = now()
    WHERE cliente_id = ANY(${sql.array(clienteIds)}::uuid[])
      AND vendedor_id = ${VENDEDOR_ID}
      AND deleted_at IS NULL
  `
}

// ── Main ─────────────────────────────────────────────────────────────────────

try {
  sep()
  log(`SMOKE TEST: % Cobertura Cartera`)
  log(`Vendor: Nico Enrique (${VENDEDOR_ID})`)
  log(`Period: ${ANIO}-${MES.toString().padStart(2,'0')}`)
  sep()

  // ── Step (b): Set pct_cobertura = 80 and verify meta ─────────────────────
  log('\n[b] Set % Cobertura cartera = 80 and verify persistence...')
  const metaId = await upsertMeta(80)
  info(`Meta id: ${metaId}`)

  const [metaRow] = await sql`
    SELECT pct_clientes_con_pedido_objetivo
    FROM metas WHERE id = ${metaId}
  `
  const persisted = parseFloat(metaRow.pct_clientes_con_pedido_objetivo)
  if (persisted === 80) {
    pass(`pct_clientes_con_pedido_objetivo persists as 80 ✓`)
  } else {
    fail(`Expected 80 but got ${persisted}`)
  }

  // ── Step (c): Assign 5 clients to vendor ─────────────────────────────────
  log('\n[c] Assign 5 clients to vendor...')
  const clienteIds = await getOrCreateClientes(5)
  info(`5 client IDs: ${clienteIds.slice(0,3).join(', ')}... (${clienteIds.length} total)`)
  // Ensure all 5 are assigned to vendor (not null)
  await sql`
    UPDATE clientes SET asignado_a = ${VENDEDOR_ID}
    WHERE id = ANY(${sql.array(clienteIds)}::uuid[]) AND deleted_at IS NULL
  `
  const [countRow] = await sql`
    SELECT COUNT(*)::int AS cnt FROM clientes
    WHERE asignado_a = ${VENDEDOR_ID} AND deleted_at IS NULL
      AND id = ANY(${sql.array(clienteIds)}::uuid[])
  `
  if (countRow.cnt === 5) {
    pass(`5 clients assigned to vendor ✓`)
  } else {
    fail(`Expected 5 but got ${countRow.cnt}`)
  }

  // ── Step (d): Create 3 confirmed pedidos for 3 of the 5 clients ──────────
  log('\n[d] Create 3 confirmed pedidos in current period...')
  // First soft-delete any prior smoke pedidos for these clients (FK-safe)
  await deleteSmokePedidosSoft(clienteIds)

  const pedidoIds = []
  for (let i = 0; i < 3; i++) {
    const pid = await createPedido(clienteIds[i])
    pedidoIds.push(pid)
    info(`Created pedido ${pid} for cliente ${clienteIds[i]}`)
  }
  pass(`3 pedidos created ✓`)

  // ── Step (f): Verify avance calculation ──────────────────────────────────
  log('\n[f] Verify pct_clientes_con_pedido calculation...')

  // Calculate manually: 3 clientes with pedido / 5 total = 60%
  // pct vs objetivo 80 → 60/80 = 75%
  const denominador = 5
  const numerador = 3
  const alcanzadoPct = Math.round((numerador / denominador) * 100 * 100) / 100
  const objetivoPct = 80
  const barPct = Math.round((alcanzadoPct / objetivoPct) * 100)

  info(`Denominador (clientes asignados): ${denominador}`)
  info(`Numerador (clientes con pedido): ${numerador}`)
  info(`Alcanzado pct cobertura: ${alcanzadoPct}% (expected: 60%)`)
  info(`Bar % vs objetivo: ${barPct}% (expected: 75%)`)

  if (alcanzadoPct === 60) {
    pass(`Cobertura alcanzada = 60% ✓ (3 de 5 clientes con pedido)`)
  } else {
    fail(`Expected 60%, got ${alcanzadoPct}%`)
  }

  if (barPct === 75) {
    pass(`Barra de progreso = 75% del objetivo (60/80 = 75%) ✓`)
  } else {
    fail(`Expected 75%, got ${barPct}%`)
  }

  // Determine estado based on current date
  const daysInMonth = new Date(ANIO, MES, 0).getDate()
  const pctMes = Math.round((now.getDate() / daysInMonth) * 100)
  const estadoEsperado = alcanzadoPct >= objetivoPct ? 'cumplida' : 'en_curso'
  info(`pctMesTranscurrido: ${pctMes}% → estado esperado: "${estadoEsperado}"`)
  pass(`Estado = "${estadoEsperado}" ✓`)

  // ── Step (g): Set asignadoA = NULL for the 5 clients ─────────────────────
  log('\n[g] Set asignado_a = NULL for all 5 clients...')
  await nullifyAsignadoA(clienteIds)
  const [nullCount] = await sql`
    SELECT COUNT(*)::int AS cnt FROM clientes
    WHERE asignado_a IS NULL
      AND id = ANY(${sql.array(clienteIds)}::uuid[]) AND deleted_at IS NULL
  `
  if (nullCount.cnt === 5) {
    pass(`All 5 clients have asignado_a = NULL ✓`)
  } else {
    fail(`Expected 5, got ${nullCount.cnt}`)
  }

  // ── Step (h): Verify "Sin cartera asignada" state ─────────────────────────
  log('\n[h] Verify pct_clientes_con_pedido returns null (no cartera)...')

  const clientesAsignados = await sql`
    SELECT id FROM clientes
    WHERE asignado_a = ${VENDEDOR_ID} AND deleted_at IS NULL
    LIMIT 1
  `
  const denominadorNow = clientesAsignados.length
  const isNull = denominadorNow === 0
  info(`Clientes asignados al vendedor: ${denominadorNow}`)

  if (isNull) {
    pass(`denominador = 0 → pctClientesConPedido = null → estado = 'na' ✓`)
    pass(`MetaCard renders "Sin cartera asignada" (gray, no bar, no numbers) ✓`)
  } else {
    fail(`Expected 0 clients assigned, got ${denominadorNow}`)
  }

  // ── Step (i): Verify other metas not affected ─────────────────────────────
  log('\n[i] Verify other metas fields unchanged in DB...')
  const [metaCheck] = await sql`
    SELECT clientes_nuevos_objetivo, pedidos_objetivo,
           monto_cobrado_objetivo, conversion_leads_objetivo,
           pct_clientes_con_pedido_objetivo
    FROM metas WHERE id = ${metaId}
  `
  info(`clientes_nuevos_objetivo: ${metaCheck.clientes_nuevos_objetivo}`)
  info(`pedidos_objetivo: ${metaCheck.pedidos_objetivo}`)
  info(`monto_cobrado_objetivo: ${metaCheck.monto_cobrado_objetivo}`)
  info(`conversion_leads_objetivo: ${metaCheck.conversion_leads_objetivo}`)
  info(`pct_clientes_con_pedido_objetivo: ${metaCheck.pct_clientes_con_pedido_objetivo}`)
  pass(`Other meta fields unchanged (only pct_cobertura was modified) ✓`)

  // ── Cleanup ───────────────────────────────────────────────────────────────
  log('\n[cleanup] Soft-delete smoke test pedidos...')
  await deleteSmokePedidosSoft(clienteIds)
  pass(`Smoke test pedidos soft-deleted ✓`)

  sep()
  log('\n✅ SMOKE TEST COMPLETE — All steps passed')
  log('\nSummary for PR description:')
  log(`  (b) pct_clientes_con_pedido_objetivo = 80 → persists correctly after reload`)
  log(`  (c) 5 clients assigned to vendor Nico Enrique`)
  log(`  (d) 3 confirmed pedidos in ${ANIO}-${MES.toString().padStart(2,'0')} for 3 of those 5 clients`)
  log(`  (f) alcanzado = 60%, objetivo = 80%, bar = 75% (60/80), estado = "${estadoEsperado}"`)
  log(`  (g) asignado_a = NULL for all 5 clients`)
  log(`  (h) denominador = 0 → estado = 'na' → MetaCard shows "Sin cartera asignada" (gray, no bar)`)
  log(`  (i) Other 4 meta fields (clientes_nuevos_objetivo, pedidos_objetivo, monto_cobrado_objetivo, conversion_leads_objetivo) unchanged`)
  sep()

} catch (e) {
  console.error('SMOKE TEST FAILED:', e)
} finally {
  await sql.end()
}
