-- Migration 0020: Add 'fabrica' role and 'en_reparto' order state
ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'fabrica';
ALTER TYPE "estado_pedido" ADD VALUE IF NOT EXISTS 'en_reparto';
