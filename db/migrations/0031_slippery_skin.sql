ALTER TABLE "clientes" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "lng" double precision;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "geocoded_at" timestamp;--> statement-breakpoint
ALTER TABLE "empresa_config" ADD COLUMN "depot_lat" double precision;--> statement-breakpoint
ALTER TABLE "empresa_config" ADD COLUMN "depot_lng" double precision;