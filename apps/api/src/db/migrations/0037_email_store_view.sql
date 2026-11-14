ALTER TABLE "email_outbox" ADD COLUMN "store_view" text DEFAULT 'eu-en' NOT NULL;--> statement-breakpoint
ALTER TABLE "newsletter_subscribers" ADD COLUMN "store_view" text DEFAULT 'eu-en' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_alerts" ADD COLUMN "store_view" text DEFAULT 'eu-en' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "store_view" text DEFAULT 'eu-en' NOT NULL;