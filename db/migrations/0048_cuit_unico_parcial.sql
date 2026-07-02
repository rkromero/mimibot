-- CUIT único global entre clientes activos (null permitido, no colisiona).
-- 1) Normaliza datos existentes: trim; vacío o solo espacios → NULL, para que
--    los "" no cuenten como duplicados entre sí.
UPDATE "clientes"
SET "cuit" = NULLIF(btrim("cuit"), '')
WHERE "cuit" IS NOT NULL
  AND "cuit" IS DISTINCT FROM NULLIF(btrim("cuit"), '');
--> statement-breakpoint
-- 2) Índice ÚNICO PARCIAL sobre cuit, solo si no hay CUITs duplicados entre
--    clientes no borrados. Si los hay, NO se crea y se reporta la lista
--    (nombre + id + cuit) para resolverlos primero con la fusión; el arranque
--    (scripts/migrate.mjs) reintenta la creación en cada deploy de forma
--    idempotente.
DO $$
DECLARE
  duplicados text;
BEGIN
  SELECT string_agg(format('CUIT %s: %s', d.cuit, d.detalle), E'\n')
    INTO duplicados
  FROM (
    SELECT c."cuit",
           string_agg(c."nombre" || ' ' || c."apellido" || ' (id ' || c."id" || ')', ', ' ORDER BY c."created_at") AS detalle
    FROM "clientes" c
    WHERE c."cuit" IS NOT NULL AND c."deleted_at" IS NULL
    GROUP BY c."cuit"
    HAVING count(*) > 1
  ) d;

  IF duplicados IS NOT NULL THEN
    RAISE WARNING 'clientes_cuit_unique_idx NO creado: hay CUITs duplicados entre clientes activos. Resolverlos con la fusión; el índice se reintenta en el próximo arranque. Lista:%', E'\n' || duplicados;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "clientes_cuit_unique_idx"
      ON "clientes" ("cuit")
      WHERE "cuit" IS NOT NULL AND "deleted_at" IS NULL;
  END IF;
END $$;
