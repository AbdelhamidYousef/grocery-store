CREATE TYPE "public"."net_unit" AS ENUM('g', 'ml');--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"story" text DEFAULT '' NOT NULL,
	"accent_color" text DEFAULT '#F59E0B' NOT NULL,
	"logo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "collection_products" (
	"collection_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "collection_products_collection_id_product_id_pk" PRIMARY KEY("collection_id","product_id"),
	CONSTRAINT "collection_products_position_check" CHECK ("collection_products"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"accent_color" text DEFAULT '#8B5CF6' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collections_slug_unique" UNIQUE("slug"),
	CONSTRAINT "collections_window_check" CHECK ("collections"."starts_at" is null or "collections"."ends_at" is null or "collections"."ends_at" > "collections"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "product_tags" (
	"product_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "product_tags_product_id_tag_id_pk" PRIMARY KEY("product_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "trial_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_key" text NOT NULL,
	"variant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "net_amount" integer;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "net_unit" "net_unit";--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "is_trial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "swatch_hex" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "brand_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_bestseller_override" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_eco" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "badge_new_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_tags" ADD CONSTRAINT "product_tags_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_tags" ADD CONSTRAINT "product_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_redemptions" ADD CONSTRAINT "trial_redemptions_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_redemptions" ADD CONSTRAINT "trial_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_products_product_id_idx" ON "collection_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_tags_tag_id_idx" ON "product_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trial_redemptions_live_idx" ON "trial_redemptions" USING btree ("customer_key","variant_id") WHERE "trial_redemptions"."released_at" is null;--> statement-breakpoint
CREATE INDEX "trial_redemptions_order_id_idx" ON "trial_redemptions" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_brand_id_idx" ON "products" USING btree ("brand_id");--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_net_amount_check" CHECK ("product_variants"."net_amount" is null or "product_variants"."net_amount" > 0);--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_net_pair_check" CHECK (("product_variants"."net_amount" is null) = ("product_variants"."net_unit" is null));--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_swatch_hex_check" CHECK ("product_variants"."swatch_hex" is null or "product_variants"."swatch_hex" ~ '^#[0-9a-fA-F]{6}$');--> statement-breakpoint
CREATE TRIGGER brands_set_updated_at BEFORE UPDATE ON "brands" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER collections_set_updated_at BEFORE UPDATE ON "collections" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
-- Data migration: the phase 3 jsonb brand becomes a brands row + products.brand_id, then the jsonb
-- key is dropped so there is one source of truth.
INSERT INTO "brands" ("slug", "name")
SELECT DISTINCT trim(both '-' from regexp_replace(lower("attributes"->>'brand'), '[^a-z0-9]+', '-', 'g')), "attributes"->>'brand'
FROM "products"
WHERE "attributes" ? 'brand' AND trim("attributes"->>'brand') <> ''
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
UPDATE "products" p SET "brand_id" = b."id"
FROM "brands" b
WHERE p."attributes" ? 'brand'
  AND b."slug" = trim(both '-' from regexp_replace(lower(p."attributes"->>'brand'), '[^a-z0-9]+', '-', 'g'));
--> statement-breakpoint
UPDATE "products" SET "attributes" = "attributes" - 'brand' WHERE "attributes" ? 'brand';
