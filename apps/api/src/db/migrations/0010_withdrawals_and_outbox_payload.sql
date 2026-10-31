CREATE TYPE "public"."withdrawal_status" AS ENUM('new', 'acknowledged', 'done');--> statement-breakpoint
CREATE TABLE "withdrawal_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"email" "citext" NOT NULL,
	"items_text" text,
	"reason" text,
	"status" "withdrawal_status" DEFAULT 'new' NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_outbox" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "withdrawal_requests_order_id_idx" ON "withdrawal_requests" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "withdrawal_requests_status_idx" ON "withdrawal_requests" USING btree ("status","created_at");
--> statement-breakpoint
CREATE TRIGGER withdrawal_requests_set_updated_at BEFORE UPDATE ON "withdrawal_requests" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
