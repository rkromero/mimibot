-- Huella del contenido del pedido al emitir un remito/proforma. Permite
-- reutilizar el mismo número mientras el pedido no cambie (ver
-- lib/pdf/documento-vigente.ts). Aditiva e idempotente.
ALTER TABLE "documentos_emitidos" ADD COLUMN IF NOT EXISTS "contenido_hash" text;
