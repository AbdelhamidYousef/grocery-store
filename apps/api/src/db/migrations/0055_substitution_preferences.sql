CREATE TYPE "public"."pick_status" AS ENUM('pending', 'picked', 'short', 'missing', 'substituted');--> statement-breakpoint
CREATE TYPE "public"."substitution_preference" AS ENUM('best_match', 'specific', 'none');--> statement-breakpoint
CREATE TYPE "public"."swap_status" AS ENUM('proposed', 'accepted', 'rejected');--> statement-breakpoint
ALTER TABLE "cart_items" ADD COLUMN "substitution" "substitution_preference" DEFAULT 'best_match' NOT NULL;--> statement-breakpoint
ALTER TABLE "cart_items" ADD COLUMN "substitute_variant_id" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "substitution" "substitution_preference" DEFAULT 'best_match' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "substitute_variant_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "default_substitution" "substitution_preference" DEFAULT 'best_match' NOT NULL;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_substitute_variant_id_product_variants_id_fk" FOREIGN KEY ("substitute_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_substitute_variant_id_product_variants_id_fk" FOREIGN KEY ("substitute_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;