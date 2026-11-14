CREATE TYPE "public"."point_kind" AS ENUM('earn', 'redeem', 'reversal', 'bonus', 'donate', 'adjust');--> statement-breakpoint
CREATE TABLE "points_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"kind" "point_kind" NOT NULL,
	"order_id" uuid,
	"ref_key" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "points_ledger_ref_key_unique" UNIQUE("ref_key"),
	CONSTRAINT "points_ledger_delta_check" CHECK ("points_ledger"."delta" <> 0),
	CONSTRAINT "points_ledger_sign_check" CHECK (("points_ledger"."kind" IN ('earn', 'bonus') AND "points_ledger"."delta" > 0) OR ("points_ledger"."kind" IN ('redeem', 'donate') AND "points_ledger"."delta" < 0) OR "points_ledger"."kind" IN ('reversal', 'adjust'))
);
--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "points_ledger_user_created_idx" ON "points_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "points_ledger_order_id_idx" ON "points_ledger" USING btree ("order_id");