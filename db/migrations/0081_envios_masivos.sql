-- Envíos masivos de plantillas de WhatsApp a grupos de leads (Operación →
-- Envíos masivos, solo admin). Ver lib/envios-masivos/. Aditiva e idempotente.
DO $$ BEGIN
  CREATE TYPE "estado_envio_masivo" AS ENUM ('programado', 'enviando', 'completado', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "estado_destinatario_envio" AS ENUM ('pendiente', 'enviado', 'fallido', 'omitido', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "envios_masivos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "nombre" text NOT NULL,
  "template_name" text NOT NULL,
  "template_lang" text NOT NULL,
  "template_body" text NOT NULL,
  "filtros" jsonb NOT NULL DEFAULT '{}',
  "estado" "estado_envio_masivo" NOT NULL DEFAULT 'programado',
  "programado_at" timestamp NOT NULL,
  "iniciado_at" timestamp,
  "finalizado_at" timestamp,
  "total" integer NOT NULL DEFAULT 0,
  "enviados" integer NOT NULL DEFAULT 0,
  "fallidos" integer NOT NULL DEFAULT 0,
  "omitidos" integer NOT NULL DEFAULT 0,
  "creado_por" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "envios_masivos_estado_prog_idx" ON "envios_masivos" ("estado", "programado_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "envios_masivos_destinatarios" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "envio_id" uuid NOT NULL REFERENCES "envios_masivos"("id") ON DELETE CASCADE,
  "lead_id" uuid NOT NULL REFERENCES "leads"("id"),
  "conversation_id" uuid REFERENCES "conversations"("id"),
  "estado" "estado_destinatario_envio" NOT NULL DEFAULT 'pendiente',
  "motivo" text,
  "message_id" uuid REFERENCES "messages"("id"),
  "enviado_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "envios_dest_envio_idx" ON "envios_masivos_destinatarios" ("envio_id", "estado");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "envios_dest_lead_idx" ON "envios_masivos_destinatarios" ("lead_id", "enviado_at");
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "envio_masivo_id" uuid REFERENCES "envios_masivos"("id");
