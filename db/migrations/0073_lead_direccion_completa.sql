-- Dirección completa y documento del lead: provincia, código postal y CUIT/DNI.
-- Se cargan desde el panel del lead (secciones Contacto y Dirección) y se
-- copian a la ficha del cliente al enviar la muestra o al convertirlo, igual
-- que calle y localidad. Aditiva e idempotente.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "provincia" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "codigo_postal" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "cuit" text;
