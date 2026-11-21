ALTER TABLE "reviews" DROP CONSTRAINT "reviews_pet_age_check";--> statement-breakpoint
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_pet_weight_check";--> statement-breakpoint
DROP INDEX "menu_promos_pet_idx";--> statement-breakpoint
ALTER TABLE "menu_promos" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "newsletter_subscribers" ADD COLUMN "interests" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "testimonials" ADD COLUMN "area" text DEFAULT 'Berlin' NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_promos" ADD CONSTRAINT "menu_promos_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "menu_promos_category_idx" ON "menu_promos" USING btree ("category_id","active","sort_order");--> statement-breakpoint
-- Backfill (add, backfill, drop): a promo that belonged to a pet now belongs to that pet's old
-- top-level category, so no row loses its place. The old categories are replaced by the departments
-- when the catalogue is reseeded; on a fresh database there are no rows and this does nothing.
UPDATE "menu_promos" SET "category_id" = c."id" FROM "categories" c WHERE c."slug" = CASE "menu_promos"."pet"::text WHEN 'dog' THEN 'dogs' WHEN 'cat' THEN 'cats' WHEN 'bird' THEN 'birds' WHEN 'fish' THEN 'fish' WHEN 'small' THEN 'small-pets' WHEN 'reptile' THEN 'reptiles' END;--> statement-breakpoint
-- Newsletter pet preferences have no department equivalent, so `interests` starts empty (which means
-- "everything"); testimonials get the default area. Product attributes lose the pet-only keys.
UPDATE "products" SET "attributes" = "attributes" - 'pet' - 'material' - 'ageStage';--> statement-breakpoint
ALTER TABLE "menu_promos" DROP COLUMN "pet";--> statement-breakpoint
ALTER TABLE "newsletter_subscribers" DROP COLUMN "pets";--> statement-breakpoint
ALTER TABLE "reviews" DROP COLUMN "pet_age_months";--> statement-breakpoint
ALTER TABLE "reviews" DROP COLUMN "pet_weight_g";--> statement-breakpoint
ALTER TABLE "testimonials" DROP COLUMN "pet";--> statement-breakpoint
DROP TYPE "public"."pet_species";