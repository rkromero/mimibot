ALTER TABLE "conversations" DROP CONSTRAINT "conversations_lead_id_unique";--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "lead_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "cliente_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_cliente_id_idx" ON "conversations" USING btree ("cliente_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_lead_id_unique_idx" ON "conversations" USING btree ("lead_id") WHERE "conversations"."lead_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_cliente_id_unique_idx" ON "conversations" USING btree ("cliente_id") WHERE "conversations"."cliente_id" IS NOT NULL;--> statement-breakpoint
UPDATE conversations c SET cliente_id = cl.id FROM clientes cl WHERE cl.lead_id = c.lead_id AND c.lead_id IS NOT NULL AND c.cliente_id IS NULL;
