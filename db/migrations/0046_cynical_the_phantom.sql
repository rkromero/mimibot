CREATE TYPE "public"."resultado_visita" AS ENUM('compro', 'no_compro', 'no_estaba', 'reprogramar');--> statement-breakpoint
ALTER TABLE "actividades_cliente" ADD COLUMN "resultado" "resultado_visita";--> statement-breakpoint
ALTER TABLE "actividades_cliente" ADD COLUMN "lat" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "actividades_cliente" ADD COLUMN "lng" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "actividades_cliente" ADD COLUMN "geo_precision" numeric(7, 2);