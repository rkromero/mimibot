-- Non-destructive performance indexes for scaling to thousands of records.
-- All indexes use CONCURRENTLY + IF NOT EXISTS — safe to run on live production (no table lock).
-- Run manually on Railway: psql $DATABASE_URL < db/migrations/0012_performance_indexes.sql

-- Trigram extension for fast ILIKE / similarity search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Clientes ─────────────────────────────────────────────────────────────────

-- Composite covering the most common agent-scoped list query (asignado_a + soft-delete)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clientes_asignado_deleted
  ON clientes (asignado_a, deleted_at);

-- Composite for gerente-scoped queries (territory + status)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clientes_territorio_estado
  ON clientes (territorio_id, estado_actividad);

-- GIN trigram indexes replace slow ILIKE '%x%' full scans with fast GIN scans
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clientes_nombre_trgm
  ON clientes USING gin (nombre gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clientes_apellido_trgm
  ON clientes USING gin (apellido gin_trgm_ops);

-- email already has a B-tree index; add GIN for substring search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clientes_email_trgm
  ON clientes USING gin (email gin_trgm_ops);

-- ── Pedidos ───────────────────────────────────────────────────────────────────

-- Most common access: list pedidos for a client ordered by date
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pedidos_cliente_fecha
  ON pedidos (cliente_id, fecha DESC);

-- Used by metas/avance: pedidos por vendedor y fecha
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pedidos_vendedor_fecha
  ON pedidos (vendedor_id, fecha DESC);

-- Partial index on estado for filtered list views (no deleted rows)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pedidos_estado_active
  ON pedidos (estado) WHERE deleted_at IS NULL;

-- ── Movimientos CC ────────────────────────────────────────────────────────────

-- Most common: all movements for a client, newest first (index exists but lacks DESC)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_movimientos_cc_cliente_fecha_desc
  ON movimientos_cc (cliente_id, fecha DESC);

-- ── Productos ─────────────────────────────────────────────────────────────────

-- Trigram search on nombre (sku already has a unique B-tree index)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_productos_nombre_trgm
  ON productos USING gin (nombre gin_trgm_ops);
