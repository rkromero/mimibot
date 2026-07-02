import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { clientes, empresaConfig } from '@/db/schema'
import { geocodeStructured, resolverRegion } from './ors'

// 'ok'      → se geocodificó y guardó lat/lng.
// 'failed'  → no se resolvió en la región esperada; queda lat/lng=null (navega por dirección).
// 'skipped' → no se intentó (cliente inexistente, ya geocodificado sin force, o sin dirección).
export type GeocodeResultado = 'ok' | 'failed' | 'skipped'

export async function geocodeClienteIfNeeded(
  clienteId: string,
  opts: { force?: boolean } = {},
): Promise<GeocodeResultado> {
  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
    columns: {
      id: true, direccion: true, localidad: true, provincia: true, lat: true, lng: true,
      barrio: true, codigoPostal: true,
    },
  })
  if (!cliente) return 'skipped'

  // Skip if already geocoded and not forced
  if (!opts.force && cliente.lat !== null && cliente.lng !== null) return 'skipped'

  if (!cliente.direccion) return 'skipped'

  // Región esperada (provincia, o localidad si la provincia no la define, p.ej. "CABA").
  const expectedRegion = resolverRegion(cliente.provincia, cliente.localidad)

  const result = await geocodeStructured({
    address: cliente.direccion,
    locality: cliente.localidad,
    region: cliente.provincia,
  })

  if (!result) {
    console.warn(
      `[geocode] Sin resultado en región "${expectedRegion ?? 'AR'}" para cliente ${clienteId}: "${cliente.direccion}"`,
    )
    await db
      .update(clientes)
      .set({ lat: null, lng: null, geocodeStatus: 'failed', geocodedAt: new Date() })
      .where(eq(clientes.id, clienteId))
    return 'failed'
  }

  // Best-effort: si Pelias trae barrio/CP y el cliente no los tiene cargados,
  // se completan junto con las coordenadas (nunca se pisan valores existentes).
  const extras: Partial<typeof clientes.$inferInsert> = {}
  if (!cliente.barrio?.trim() && result.neighbourhood) extras.barrio = result.neighbourhood
  if (!cliente.codigoPostal?.trim() && result.postalcode) extras.codigoPostal = result.postalcode

  await db
    .update(clientes)
    .set({ lat: result.lat, lng: result.lng, geocodeStatus: 'ok', geocodedAt: new Date(), ...extras })
    .where(eq(clientes.id, clienteId))
  return 'ok'
}

export async function geocodeDepot(): Promise<void> {
  const [config] = await db
    .select({
      id: empresaConfig.id,
      direccion: empresaConfig.direccion,
      localidad: empresaConfig.localidad,
      provincia: empresaConfig.provincia,
    })
    .from(empresaConfig)
    .where(eq(empresaConfig.id, 1))
    .limit(1)

  if (!config?.direccion) return

  const result = await geocodeStructured({
    address: config.direccion,
    locality: config.localidad,
    region: config.provincia,
  })

  if (!result) {
    console.warn(`[geocode] Sin resultado para depósito: "${config.direccion}"`)
    return
  }

  await db
    .update(empresaConfig)
    .set({ depotLat: result.lat, depotLng: result.lng })
    .where(eq(empresaConfig.id, 1))
}
