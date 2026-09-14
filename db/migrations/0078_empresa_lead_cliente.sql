-- Empresa / marca en leads y clientes, como columna propia. Las landings ya la
-- mandaban y quedaba escondida en leads.custom_fields->>'empresa': se rescata
-- de ahí. Los clientes convertidos heredan la del lead. Aditiva e idempotente.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "empresa" text;
--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "empresa" text;
--> statement-breakpoint
UPDATE "leads"
SET "empresa" = NULLIF(BTRIM("custom_fields"->>'empresa'), '')
WHERE "empresa" IS NULL
  AND "custom_fields" ? 'empresa'
  AND NULLIF(BTRIM("custom_fields"->>'empresa'), '') IS NOT NULL;
--> statement-breakpoint
UPDATE "clientes" c
SET "empresa" = l."empresa"
FROM "leads" l
WHERE c."lead_id" = l."id"
  AND c."empresa" IS NULL
  AND l."empresa" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clientes_empresa_idx" ON "clientes" ("empresa");
