-- Migration 0015: Add 'vendedor' role as an independent copy of 'agent'
-- Vendedor has the same permissions, views and functions as agent today,
-- but is decoupled so future agent changes won't affect vendedor.
ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'vendedor';
