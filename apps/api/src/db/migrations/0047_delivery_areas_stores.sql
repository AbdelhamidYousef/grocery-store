CREATE TABLE "dark_stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"street" text NOT NULL,
	"postal_code" char(5) NOT NULL,
	"area_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dark_stores_slug_unique" UNIQUE("slug"),
	CONSTRAINT "dark_stores_area_id_unique" UNIQUE("area_id")
);
--> statement-breakpoint
CREATE TABLE "delivery_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_areas_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "postcodes" (
	"code" char(5) PRIMARY KEY NOT NULL,
	"area_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dark_stores" ADD CONSTRAINT "dark_stores_area_id_delivery_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."delivery_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postcodes" ADD CONSTRAINT "postcodes_area_id_delivery_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."delivery_areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE TRIGGER delivery_areas_set_updated_at BEFORE UPDATE ON "delivery_areas" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER dark_stores_set_updated_at BEFORE UPDATE ON "dark_stores" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
-- The four areas and their stores are created here (same fixed ids as db/seed/delivery.ts), not only
-- by the seed: the next migration copies every existing stock row to each store, so the stores must
-- exist on a database that was migrated but never reseeded. The postcodes come from the seed.
INSERT INTO "delivery_areas" ("id", "slug", "name") VALUES
	('a0000000-0000-4000-8000-000000000001', 'mitte', 'Mitte'),
	('a0000000-0000-4000-8000-000000000002', 'prenzlauer-berg', 'Prenzlauer Berg'),
	('a0000000-0000-4000-8000-000000000003', 'kreuzberg-friedrichshain', 'Kreuzberg-Friedrichshain'),
	('a0000000-0000-4000-8000-000000000004', 'neukoelln', 'Neukölln');--> statement-breakpoint
INSERT INTO "dark_stores" ("id", "slug", "name", "street", "postal_code", "area_id") VALUES
	('b0000000-0000-4000-8000-000000000001', 'mitte', 'Grocery Mitte', 'Brunnenstraße 14', '10119', 'a0000000-0000-4000-8000-000000000001'),
	('b0000000-0000-4000-8000-000000000002', 'prenzlauer-berg', 'Grocery Prenzlauer Berg', 'Greifswalder Straße 40', '10405', 'a0000000-0000-4000-8000-000000000002'),
	('b0000000-0000-4000-8000-000000000003', 'kreuzberg-friedrichshain', 'Grocery Kreuzberg-Friedrichshain', 'Skalitzer Straße 72', '10997', 'a0000000-0000-4000-8000-000000000003'),
	('b0000000-0000-4000-8000-000000000004', 'neukoelln', 'Grocery Neukölln', 'Sonnenallee 95', '12045', 'a0000000-0000-4000-8000-000000000004');
