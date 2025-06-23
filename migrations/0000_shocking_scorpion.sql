CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."classification_category" AS ENUM('consumable_materials', 'non_consumable_materials', 'labor', 'tools_equipment');--> statement-breakpoint
CREATE TYPE "public"."flag_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."flag_type" AS ENUM('duplicate_invoice', 'amount_mismatch', 'missing_po_match', 'tax_id_mismatch', 'vendor_mismatch', 'date_discrepancy');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('pending', 'processing', 'extracted', 'approved', 'rejected', 'paid', 'matched');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('auto', 'manual', 'unresolved');--> statement-breakpoint
CREATE TYPE "public"."petty_cash_status" AS ENUM('pending_approval', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."po_status" AS ENUM('open', 'partial', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."validation_rule_type" AS ENUM('required', 'regex', 'range', 'enum', 'format', 'comparison');--> statement-breakpoint
CREATE TYPE "public"."validation_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"approver_id" varchar NOT NULL,
	"status" "approval_status" DEFAULT 'pending',
	"comments" text,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "approved_invoice_project" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"project_id" varchar(100) NOT NULL,
	"match_score" numeric(5, 2) NOT NULL,
	"match_details" jsonb,
	"approved_by" varchar NOT NULL,
	"approved_at" timestamp DEFAULT now(),
	"original_match_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "classification_keywords" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" "classification_category" NOT NULL,
	"keyword" varchar(255) NOT NULL,
	"is_default" boolean DEFAULT false,
	"user_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "feedback_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"original_text" text,
	"extracted_data" jsonb,
	"corrected_data" jsonb,
	"reason" text,
	"file_name" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invoice_flags" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"flag_type" "flag_type" NOT NULL,
	"severity" "flag_severity" NOT NULL,
	"message" text NOT NULL,
	"details" jsonb,
	"is_resolved" boolean DEFAULT false,
	"resolved_by" varchar,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invoice_po_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"po_id" integer NOT NULL,
	"match_score" numeric(5, 2) NOT NULL,
	"status" "match_status" DEFAULT 'auto',
	"match_details" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invoice_project_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"project_id" varchar(100) NOT NULL,
	"match_score" numeric(5, 2) NOT NULL,
	"status" "match_status" DEFAULT 'auto',
	"match_details" jsonb,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"file_name" varchar NOT NULL,
	"file_url" varchar,
	"status" "invoice_status" DEFAULT 'pending',
	"vendor_name" varchar,
	"invoice_number" varchar,
	"invoice_date" timestamp,
	"due_date" timestamp,
	"total_amount" numeric(10, 2),
	"tax_amount" numeric(10, 2),
	"subtotal" numeric(10, 2),
	"currency" varchar DEFAULT 'USD',
	"ocr_text" text,
	"extracted_data" jsonb,
	"project_name" varchar,
	"confidence_score" numeric(3, 2),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "line_item_classifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"line_item_id" integer NOT NULL,
	"category" "classification_category" NOT NULL,
	"matched_keyword" varchar(255),
	"is_manual_override" boolean DEFAULT false,
	"confidence" numeric(3, 2),
	"classified_at" timestamp DEFAULT now(),
	"classified_by" varchar
);
--> statement-breakpoint
CREATE TABLE "line_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"total_price" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "petty_cash_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"project_id" varchar(100),
	"cost_center" varchar(100),
	"approved_by" varchar,
	"approval_file_url" text,
	"status" "petty_cash_status" DEFAULT 'pending_approval',
	"approval_notes" text,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "predictive_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"prediction" text NOT NULL,
	"confidence" numeric(3, 2) NOT NULL,
	"alert_type" varchar(100) NOT NULL,
	"details" jsonb,
	"is_actioned" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"address" varchar(500),
	"city" varchar(100),
	"vat_number" varchar(50),
	"supervisor" varchar(255),
	"budget" numeric(12, 2),
	"currency" varchar(3) DEFAULT 'COP',
	"start_date" timestamp,
	"end_date" timestamp,
	"status" varchar(50) DEFAULT 'active',
	"validation_status" varchar(50) DEFAULT 'pending',
	"is_validated" boolean DEFAULT false,
	"validated_at" timestamp,
	"validated_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "projects_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"po_id" varchar(100) NOT NULL,
	"vendor_name" varchar(255) NOT NULL,
	"project_id" varchar(100),
	"amount" numeric(12, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'COP',
	"items" jsonb NOT NULL,
	"issue_date" timestamp NOT NULL,
	"expected_delivery_date" timestamp,
	"status" "po_status" DEFAULT 'open',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "purchase_orders_po_id_unique" UNIQUE("po_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "validation_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"rule_type" "validation_rule_type" NOT NULL,
	"rule_data" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"field_name" varchar NOT NULL,
	"rule_value" text NOT NULL,
	"severity" "validation_severity" DEFAULT 'medium',
	"error_message" text
);
--> statement-breakpoint
ALTER TABLE "approved_invoice_project" ADD CONSTRAINT "approved_invoice_project_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approved_invoice_project" ADD CONSTRAINT "approved_invoice_project_project_id_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approved_invoice_project" ADD CONSTRAINT "approved_invoice_project_original_match_id_invoice_project_matches_id_fk" FOREIGN KEY ("original_match_id") REFERENCES "public"."invoice_project_matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_logs" ADD CONSTRAINT "feedback_logs_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_flags" ADD CONSTRAINT "invoice_flags_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_po_matches" ADD CONSTRAINT "invoice_po_matches_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_po_matches" ADD CONSTRAINT "invoice_po_matches_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_project_matches" ADD CONSTRAINT "invoice_project_matches_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_project_matches" ADD CONSTRAINT "invoice_project_matches_project_id_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_item_classifications" ADD CONSTRAINT "line_item_classifications_line_item_id_line_items_id_fk" FOREIGN KEY ("line_item_id") REFERENCES "public"."line_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petty_cash_log" ADD CONSTRAINT "petty_cash_log_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictive_alerts" ADD CONSTRAINT "predictive_alerts_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_project_id_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");