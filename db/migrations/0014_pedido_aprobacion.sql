-- Migration 0014: Add 'pendiente_aprobacion' approval state for agent-created orders
-- This value must be added outside a transaction-committed ALTER in some PG versions;
-- Drizzle's breakpoint runner handles statement isolation.
ALTER TYPE "estado_pedido" ADD VALUE IF NOT EXISTS 'pendiente_aprobacion' BEFORE 'confirmado';
