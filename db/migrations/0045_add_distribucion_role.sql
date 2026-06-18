-- Migration 0045: Add 'distribucion' role as an independent copy of 'repartidor'.
-- En esta fase 'distribucion' tiene exactamente la misma operatoria, UI, endpoints
-- y flujo (aceptar/entregar/cobrar/optimizar ruta) que 'repartidor'. La diferencia
-- funcional (marcas asignadas) llega en fases posteriores.
-- ALTER TYPE ... ADD VALUE no puede correr dentro de una transacción; el
-- IF NOT EXISTS lo hace idempotente para re-ejecuciones seguras.
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'distribucion';
