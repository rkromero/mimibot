-- Bot: precio de referencia, productos que no hacemos, plazo de la propuesta
-- y galería de medios (fotos / videos en R2). Aditiva e idempotente.
ALTER TABLE "bot_config" ADD COLUMN IF NOT EXISTS "precio_referencia" text;
--> statement-breakpoint
ALTER TABLE "bot_config" ADD COLUMN IF NOT EXISTS "productos_excluidos" text[] DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bot_config" ADD COLUMN IF NOT EXISTS "plazo_propuesta" text DEFAULT 'hoy mismo en horario hábil' NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "categoria_bot_media" AS ENUM ('producto_terminado', 'flow_pack_cristal', 'bobina_impresa', 'planta');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bot_media" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "categoria" "categoria_bot_media" NOT NULL,
  "titulo" text NOT NULL,
  "descripcion" text,
  "r2_key" text NOT NULL,
  "mime_type" text NOT NULL,
  "file_size" integer,
  "orden" integer DEFAULT 0 NOT NULL,
  "activo" boolean DEFAULT true NOT NULL,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bot_media_categoria_idx" ON "bot_media" ("categoria", "activo");
