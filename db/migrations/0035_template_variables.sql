ALTER TABLE "whatsapp_templates" ADD COLUMN IF NOT EXISTS "variables" jsonb NOT NULL DEFAULT '[]';
