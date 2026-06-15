-- Migration 0043: Add 'rtv' role as an independent copy of 'agent'.
-- En esta fase 'rtv' tiene exactamente la misma operatoria, permisos, vistas y
-- restricciones que 'agent'. La diferencia funcional (marcas asignadas) llega
-- en fases posteriores.
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'rtv';
