CREATE TABLE IF NOT EXISTS "whatsapp_config" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "phone_number_id" text NOT NULL DEFAULT '',
  "access_token" text NOT NULL DEFAULT '',
  "app_secret" text NOT NULL DEFAULT '',
  "verify_token" text NOT NULL DEFAULT '',
  "is_configured" boolean NOT NULL DEFAULT false,
  "updated_by" uuid REFERENCES "users"("id"),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
