-- Named shopping lists (G9.3) on top of the wishlist. The defaults ARE the backfill: every existing
-- wishlist row becomes the default list called 'Saved' (is_default true) and every item gets quantity 1,
-- so the old routes and share links keep working unchanged. The one-row-per-user unique constraint is
-- replaced by "one DEFAULT list per user" and "no two lists of a user with the same name".
ALTER TABLE "wishlists" DROP CONSTRAINT "wishlists_user_id_unique";--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD COLUMN "quantity" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "wishlists" ADD COLUMN "name" text DEFAULT 'Saved' NOT NULL;--> statement-breakpoint
ALTER TABLE "wishlists" ADD COLUMN "is_default" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "wishlists_one_default_per_user_idx" ON "wishlists" USING btree ("user_id") WHERE "wishlists"."is_default" and "wishlists"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "wishlists_user_name_idx" ON "wishlists" USING btree ("user_id",lower("name")) WHERE "wishlists"."user_id" is not null;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_quantity_check" CHECK ("wishlist_items"."quantity" between 1 and 99);--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_name_check" CHECK (char_length("wishlists"."name") between 1 and 40);