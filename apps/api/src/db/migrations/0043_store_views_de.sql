ALTER TABLE "carts" ALTER COLUMN "store_view" SET DEFAULT 'de-en';--> statement-breakpoint
ALTER TABLE "email_outbox" ALTER COLUMN "store_view" SET DEFAULT 'de-en';--> statement-breakpoint
ALTER TABLE "newsletter_subscribers" ALTER COLUMN "store_view" SET DEFAULT 'de-en';--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "store_view" SET DEFAULT 'de-en';--> statement-breakpoint
ALTER TABLE "stock_alerts" ALTER COLUMN "store_view" SET DEFAULT 'de-en';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "store_view" SET DEFAULT 'de-en';--> statement-breakpoint
UPDATE "carts" SET "store_view" = 'de-en' WHERE "store_view" IN ('eu-en', 'uk-en', 'fr-fr');--> statement-breakpoint
UPDATE "email_outbox" SET "store_view" = 'de-en' WHERE "store_view" IN ('eu-en', 'uk-en', 'fr-fr');--> statement-breakpoint
UPDATE "newsletter_subscribers" SET "store_view" = 'de-en' WHERE "store_view" IN ('eu-en', 'uk-en', 'fr-fr');--> statement-breakpoint
UPDATE "orders" SET "store_view" = 'de-en' WHERE "store_view" IN ('eu-en', 'uk-en', 'fr-fr');--> statement-breakpoint
UPDATE "stock_alerts" SET "store_view" = 'de-en' WHERE "store_view" IN ('eu-en', 'uk-en', 'fr-fr');--> statement-breakpoint
UPDATE "users" SET "store_view" = 'de-en' WHERE "store_view" IN ('eu-en', 'uk-en', 'fr-fr');--> statement-breakpoint
DELETE FROM "variant_prices" WHERE "currency" = 'GBP';--> statement-breakpoint
DELETE FROM "product_translations" WHERE "locale" = 'fr';--> statement-breakpoint
DELETE FROM "category_translations" WHERE "locale" = 'fr';--> statement-breakpoint
DELETE FROM "brand_translations" WHERE "locale" = 'fr';--> statement-breakpoint
DELETE FROM "collection_translations" WHERE "locale" = 'fr';--> statement-breakpoint
DELETE FROM "guide_translations" WHERE "locale" = 'fr';
