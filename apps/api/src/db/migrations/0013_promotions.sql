CREATE TYPE "public"."discount_kind" AS ENUM('percent', 'fixed', 'free_shipping');--> statement-breakpoint
CREATE TYPE "public"."flash_sale_status" AS ENUM('scheduled', 'active', 'ended');--> statement-breakpoint
CREATE TYPE "public"."order_promotion_type" AS ENUM('bulk_tier', 'code', 'free_shipping', 'credit', 'gift');--> statement-breakpoint
CREATE TYPE "public"."price_kind" AS ENUM('base', 'sale', 'member');--> statement-breakpoint
CREATE TABLE "bulk_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"min_cents" integer NOT NULL,
	"percent" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bulk_tiers_min_cents_unique" UNIQUE("min_cents"),
	CONSTRAINT "bulk_tiers_min_cents_check" CHECK ("bulk_tiers"."min_cents" > 0),
	CONSTRAINT "bulk_tiers_percent_check" CHECK ("bulk_tiers"."percent" BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE TABLE "discount_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" "citext" NOT NULL,
	"kind" "discount_kind" NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"min_spend_cents" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"max_uses" integer,
	"per_customer_max" integer,
	"exclude_sale_items" boolean DEFAULT false NOT NULL,
	"first_order_only" boolean DEFAULT false NOT NULL,
	"owner_user_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discount_codes_code_unique" UNIQUE("code"),
	CONSTRAINT "discount_codes_value_check" CHECK (("discount_codes"."kind" = 'percent' AND "discount_codes"."value" BETWEEN 1 AND 100)
        OR ("discount_codes"."kind" = 'fixed' AND "discount_codes"."value" > 0)
        OR ("discount_codes"."kind" = 'free_shipping' AND "discount_codes"."value" = 0)),
	CONSTRAINT "discount_codes_min_spend_check" CHECK ("discount_codes"."min_spend_cents" >= 0),
	CONSTRAINT "discount_codes_window_check" CHECK ("discount_codes"."starts_at" IS NULL OR "discount_codes"."ends_at" IS NULL OR "discount_codes"."ends_at" > "discount_codes"."starts_at"),
	CONSTRAINT "discount_codes_max_uses_check" CHECK ("discount_codes"."max_uses" IS NULL OR "discount_codes"."max_uses" > 0),
	CONSTRAINT "discount_codes_per_customer_check" CHECK ("discount_codes"."per_customer_max" IS NULL OR "discount_codes"."per_customer_max" > 0)
);
--> statement-breakpoint
CREATE TABLE "discount_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"customer_key" text NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discount_redemptions_code_order_unique" UNIQUE("code_id","order_id")
);
--> statement-breakpoint
CREATE TABLE "flash_sale_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"sale_price_cents" integer NOT NULL,
	"reference_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flash_sale_items_sale_variant_unique" UNIQUE("sale_id","variant_id"),
	CONSTRAINT "flash_sale_items_price_check" CHECK ("flash_sale_items"."sale_price_cents" > 0),
	CONSTRAINT "flash_sale_items_reference_check" CHECK ("flash_sale_items"."reference_cents" IS NULL OR "flash_sale_items"."reference_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "flash_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "flash_sale_status" DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flash_sales_window_check" CHECK ("flash_sales"."ends_at" > "flash_sales"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "gift_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"threshold_cents" integer NOT NULL,
	"variant_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gift_rules_threshold_check" CHECK ("gift_rules"."threshold_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"type" "order_promotion_type" NOT NULL,
	"ref_id" text NOT NULL,
	"label" text NOT NULL,
	"cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_promotions_cents_check" CHECK ("order_promotions"."cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"price_cents" integer NOT NULL,
	"kind" "price_kind" NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_history_price_check" CHECK ("price_history"."price_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "discount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "member_price_cents" integer;--> statement-breakpoint
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_redemptions" ADD CONSTRAINT "discount_redemptions_code_id_discount_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."discount_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_redemptions" ADD CONSTRAINT "discount_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flash_sale_items" ADD CONSTRAINT "flash_sale_items_sale_id_flash_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."flash_sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flash_sale_items" ADD CONSTRAINT "flash_sale_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_rules" ADD CONSTRAINT "gift_rules_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_promotions" ADD CONSTRAINT "order_promotions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discount_redemptions_customer_idx" ON "discount_redemptions" USING btree ("code_id","customer_key") WHERE "discount_redemptions"."released_at" IS NULL;--> statement-breakpoint
CREATE INDEX "discount_redemptions_order_id_idx" ON "discount_redemptions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "flash_sale_items_variant_id_idx" ON "flash_sale_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "flash_sales_status_window_idx" ON "flash_sales" USING btree ("status","starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "gift_rules_one_active_idx" ON "gift_rules" USING btree ("active") WHERE "gift_rules"."active";--> statement-breakpoint
CREATE INDEX "order_promotions_order_id_idx" ON "order_promotions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "price_history_variant_valid_from_idx" ON "price_history" USING btree ("variant_id","valid_from");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_discount_check" CHECK ("order_items"."discount_cents" >= 0 AND "order_items"."discount_cents" <= "order_items"."line_total_cents");--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_member_price_check" CHECK ("product_variants"."member_price_cents" is null or "product_variants"."member_price_cents" > 0);
--> statement-breakpoint
CREATE TRIGGER discount_codes_set_updated_at BEFORE UPDATE ON "discount_codes" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER bulk_tiers_set_updated_at BEFORE UPDATE ON "bulk_tiers" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER gift_rules_set_updated_at BEFORE UPDATE ON "gift_rules" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER flash_sales_set_updated_at BEFORE UPDATE ON "flash_sales" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER flash_sale_items_set_updated_at BEFORE UPDATE ON "flash_sale_items" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
