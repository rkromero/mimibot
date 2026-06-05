ALTER TYPE "public"."estado_pedido" ADD VALUE 'listo_para_repartir' BEFORE 'en_reparto';--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "es_reparto" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "repartidor_id" uuid;--> statement-breakpoint
ALTER TABLE "pedidos" ADD COLUMN "aceptado_at" timestamp;--> statement-breakpoint
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_repartidor_id_users_id_fk" FOREIGN KEY ("repartidor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;