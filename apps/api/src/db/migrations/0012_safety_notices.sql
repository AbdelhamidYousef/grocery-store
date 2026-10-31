CREATE TYPE "public"."safety_severity" AS ENUM('info', 'warning', 'recall');--> statement-breakpoint
CREATE TABLE "safety_notice_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notice_id" uuid NOT NULL,
	"email" "citext" NOT NULL,
	"notified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safety_notice_variants" (
	"notice_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	CONSTRAINT "safety_notice_variants_notice_id_variant_id_pk" PRIMARY KEY("notice_id","variant_id")
);
--> statement-breakpoint
CREATE TABLE "safety_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body_md" text NOT NULL,
	"severity" "safety_severity" DEFAULT 'info' NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"status" "content_status" DEFAULT 'published' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "safety_notices_dates_check" CHECK ("safety_notices"."ends_at" is null or "safety_notices"."ends_at" > "safety_notices"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "safety_notice_deliveries" ADD CONSTRAINT "safety_notice_deliveries_notice_id_safety_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."safety_notices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_notice_variants" ADD CONSTRAINT "safety_notice_variants_notice_id_safety_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."safety_notices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_notice_variants" ADD CONSTRAINT "safety_notice_variants_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "safety_notice_deliveries_notice_email_idx" ON "safety_notice_deliveries" USING btree ("notice_id","email");--> statement-breakpoint
CREATE INDEX "safety_notice_variants_variant_id_idx" ON "safety_notice_variants" USING btree ("variant_id");
--> statement-breakpoint
CREATE TRIGGER safety_notices_set_updated_at BEFORE UPDATE ON "safety_notices" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
