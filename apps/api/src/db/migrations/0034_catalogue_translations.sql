CREATE TABLE "brand_translations" (
	"brand_id" uuid NOT NULL,
	"name" text,
	"tagline" text,
	"story" text,
	"locale" text NOT NULL,
	"slug" text,
	"meta_title" text,
	"meta_description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_translations_brand_id_locale_pk" PRIMARY KEY("brand_id","locale")
);
--> statement-breakpoint
CREATE TABLE "category_translations" (
	"category_id" uuid NOT NULL,
	"name" text,
	"description" text,
	"locale" text NOT NULL,
	"slug" text,
	"meta_title" text,
	"meta_description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_translations_category_id_locale_pk" PRIMARY KEY("category_id","locale")
);
--> statement-breakpoint
CREATE TABLE "collection_translations" (
	"collection_id" uuid NOT NULL,
	"name" text,
	"description" text,
	"locale" text NOT NULL,
	"slug" text,
	"meta_title" text,
	"meta_description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_translations_collection_id_locale_pk" PRIMARY KEY("collection_id","locale")
);
--> statement-breakpoint
CREATE TABLE "guide_translations" (
	"guide_id" uuid NOT NULL,
	"title" text,
	"summary" text,
	"body_md" text,
	"locale" text NOT NULL,
	"slug" text,
	"meta_title" text,
	"meta_description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guide_translations_guide_id_locale_pk" PRIMARY KEY("guide_id","locale")
);
--> statement-breakpoint
CREATE TABLE "product_translations" (
	"product_id" uuid NOT NULL,
	"name" text,
	"description" text,
	"locale" text NOT NULL,
	"slug" text,
	"meta_title" text,
	"meta_description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_translations_product_id_locale_pk" PRIMARY KEY("product_id","locale")
);
--> statement-breakpoint
ALTER TABLE "brand_translations" ADD CONSTRAINT "brand_translations_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_translations" ADD CONSTRAINT "category_translations_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_translations" ADD CONSTRAINT "collection_translations_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_translations" ADD CONSTRAINT "guide_translations_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_translations" ADD CONSTRAINT "product_translations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brand_translations_locale_slug_idx" ON "brand_translations" USING btree ("locale","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "category_translations_locale_slug_idx" ON "category_translations" USING btree ("locale","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_translations_locale_slug_idx" ON "collection_translations" USING btree ("locale","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "guide_translations_locale_slug_idx" ON "guide_translations" USING btree ("locale","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "product_translations_locale_slug_idx" ON "product_translations" USING btree ("locale","slug");--> statement-breakpoint
CREATE INDEX "product_translations_name_idx" ON "product_translations" USING btree ("locale","name");