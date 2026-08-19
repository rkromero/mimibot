CREATE TYPE "public"."tipo_insumo" AS ENUM('galletita', 'dulce_de_leche', 'chocolate', 'bobina', 'caja', 'otro');--> statement-breakpoint
CREATE TYPE "public"."unidad_insumo" AS ENUM('kg', 'unidad');--> statement-breakpoint
CREATE TABLE "cotizador_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"margen_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"cargo_setup_personalizado" numeric(12, 2) DEFAULT '0' NOT NULL,
	"alfajores_por_caja" integer DEFAULT 12 NOT NULL,
	"validez_dias" integer DEFAULT 7 NOT NULL,
	"tope_descuento_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"condiciones_comerciales" text,
	"updated_by" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escalones_volumen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cantidad_min" integer NOT NULL,
	"cantidad_max" integer,
	"descuento_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"orden" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insumos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"tipo" "tipo_insumo" NOT NULL,
	"unidad" "unidad_insumo" NOT NULL,
	"precio" numeric(12, 2) NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receta_items" (
	"receta_id" uuid NOT NULL,
	"insumo_id" uuid NOT NULL,
	"gramos" numeric(8, 2) NOT NULL,
	CONSTRAINT "receta_items_receta_id_insumo_id_pk" PRIMARY KEY("receta_id","insumo_id")
);
--> statement-breakpoint
CREATE TABLE "recetas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gramaje" integer NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "recetas_gramaje_unique" UNIQUE("gramaje")
);
--> statement-breakpoint
ALTER TABLE "cotizador_config" ADD CONSTRAINT "cotizador_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receta_items" ADD CONSTRAINT "receta_items_receta_id_recetas_id_fk" FOREIGN KEY ("receta_id") REFERENCES "public"."recetas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receta_items" ADD CONSTRAINT "receta_items_insumo_id_insumos_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "escalones_volumen_orden_idx" ON "escalones_volumen" USING btree ("orden");--> statement-breakpoint
CREATE UNIQUE INDEX "insumos_nombre_idx" ON "insumos" USING btree ("nombre");--> statement-breakpoint
CREATE INDEX "insumos_activo_idx" ON "insumos" USING btree ("activo");--> statement-breakpoint
CREATE INDEX "receta_items_insumo_idx" ON "receta_items" USING btree ("insumo_id");