import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { clientes, empresaConfig } from '@/db/schema'
import { geocodeStructured, resolverRegion } from './ors'

export async function geocodeClienteIfNeeded(
  clienteId: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  const cliente = await db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
    columns: { id: true, direccion: true, localidad: true, provincia: true, lat: true, lng: true },
  })
  if (!cliente) return

  // Skip if already geocoded and not forced
  if (!opts.force && cliente.lat !== null && cliente.lng !== null) return

  if (!cliente.direccion) return

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
    return
  }

  await db
    .update(clientes)
    .set({ lat: result.lat, lng: result.lng, geocodeStatus: 'ok', geocodedAt: new Date() })
    .where(eq(clientes.id, clienteId))
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
