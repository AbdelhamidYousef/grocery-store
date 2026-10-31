CREATE TYPE "public"."content_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "guide_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guide_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "guide_products" (
	"guide_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	CONSTRAINT "guide_products_guide_id_product_id_pk" PRIMARY KEY("guide_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "guides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"body_md" text NOT NULL,
	"category_id" uuid NOT NULL,
	"cover_url" text,
	"status" "content_status" DEFAULT 'published' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guides_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "help_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"topic" text NOT NULL,
	"question" text NOT NULL,
	"answer_md" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "content_status" DEFAULT 'published' NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', question), 'A') || setweight(to_tsvector('english', answer_md), 'B')) STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "help_articles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "home_content" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "testimonials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"pet" text NOT NULL,
	"rating" integer NOT NULL,
	"quote" text NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "testimonials_rating_check" CHECK ("testimonials"."rating" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "guide_products" ADD CONSTRAINT "guide_products_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_products" ADD CONSTRAINT "guide_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guides" ADD CONSTRAINT "guides_category_id_guide_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."guide_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guide_products_product_id_idx" ON "guide_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "guides_category_id_idx" ON "guides" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "guides_published_at_idx" ON "guides" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "help_articles_search_idx" ON "help_articles" USING gin ("search");--> statement-breakpoint
CREATE INDEX "help_articles_topic_idx" ON "help_articles" USING btree ("topic","sort_order");
--> statement-breakpoint
CREATE TRIGGER guide_categories_set_updated_at BEFORE UPDATE ON "guide_categories" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER guides_set_updated_at BEFORE UPDATE ON "guides" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER help_articles_set_updated_at BEFORE UPDATE ON "help_articles" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER testimonials_set_updated_at BEFORE UPDATE ON "testimonials" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER home_content_set_updated_at BEFORE UPDATE ON "home_content" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
