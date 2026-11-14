ALTER TABLE "carts" ADD COLUMN "store_view" text DEFAULT 'eu-en' NOT NULL;--> statement-breakpoint
ALTER TABLE "carts" ADD COLUMN "currency" char(3) DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE "donations" ADD COLUMN "currency" char(3) DEFAULT 'EUR' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "store_view" text DEFAULT 'eu-en' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "locale" text DEFAULT 'en-IE' NOT NULL;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD COLUMN "currency" char(3);--> statement-breakpoint
ALTER TABLE "bulk_tiers" ADD COLUMN "min_by_currency" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "discount_codes" ADD COLUMN "value_by_currency" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "discount_codes" ADD COLUMN "min_spend_by_currency" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "gift_rules" ADD COLUMN "threshold_by_currency" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "shipping_methods" ADD COLUMN "by_currency" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "returns" ADD COLUMN "currency" char(3) DEFAULT 'EUR' NOT NULL;