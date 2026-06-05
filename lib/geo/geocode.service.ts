import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { clientes, empresaConfig } from '@/db/schema'
import { geocodeAddress } from './ors'

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

  const parts = [cliente.direccion, cliente.localidad, cliente.provincia].filter(Boolean)
  if (parts.length === 0) return

  const text = parts.join(', ')
  const result = await geocodeAddress(text)
  if (!result) {
    console.warn(`[geocode] Sin resultado para cliente ${clienteId}: "${text}"`)
    return
  }

  await db
    .update(clientes)
    .set({ lat: result.lat, lng: result.lng, geocodedAt: new Date() })
    .where(eq(clientes.id, clienteId))
}

export async function geocodeDepot(): Promise<void> {
  const [config] = await db
    .select({ id: empresaConfig.id, direccion: empresaConfig.direccion })
    .from(empresaConfig)
    .where(eq(empresaConfig.id, 1))
    .limit(1)

  if (!config?.direccion) return

  const result = await geocodeAddress(config.direccion)
  if (!result) {
    console.warn(`[geocode] Sin resultado para depósito: "${config.direccion}"`)
    return
  }

  await db
    .update(empresaConfig)
    .set({ depotLat: result.lat, depotLng: result.lng })
    .where(eq(empresaConfig.id, 1))
}
