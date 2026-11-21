ALTER TABLE "cart_items" ADD COLUMN "short_dated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "short_dated" boolean DEFAULT false NOT NULL;