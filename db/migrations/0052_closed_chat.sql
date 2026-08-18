-- Leads: dirección y localidad propias (para envío de muestras y conversión a
-- cliente) + acción de actividad 'muestra_creada'.
-- Nota: el generate original re-emitía gastos/proveedores/barrio/costo_envio por
-- snapshots desactualizados; esos objetos ya existen (migraciones 0047-0051) y
-- quedan cubiertos por el snapshot 0052.
ALTER TYPE "public"."activity_action" ADD VALUE IF NOT EXISTS 'muestra_creada';--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "direccion" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "localidad" text;
