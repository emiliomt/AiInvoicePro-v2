
-- Migration to add RPA (Robotic Process Automation) tables
CREATE TYPE "public"."erp_system_type" AS ENUM('custom_api', 'sftp', 'database', 'sharepoint', 'sap', 'oracle');
CREATE TYPE "public"."connection_status" AS ENUM('active', 'inactive', 'error', 'testing');
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'completed', 'failed', 'paused');
CREATE TYPE "public"."execution_status" AS ENUM('pending', 'running', 'completed', 'failed');
CREATE TYPE "public"."document_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'skipped');

-- ERP Connections table
CREATE TABLE "erp_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"connection_name" varchar(255) NOT NULL,
	"erp_system_type" "erp_system_type" NOT NULL,
	"connection_config" jsonb NOT NULL,
	"status" "connection_status" DEFAULT 'inactive',
	"is_active" boolean DEFAULT true,
	"last_connected" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

-- RPA Extraction Jobs table
CREATE TABLE "rpa_extraction_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"job_name" varchar(255) NOT NULL,
	"erp_connection_id" integer NOT NULL,
	"document_type" varchar(50) NOT NULL,
	"extraction_criteria" jsonb NOT NULL,
	"schedule_config" jsonb,
	"is_active" boolean DEFAULT true,
	"status" "job_status" DEFAULT 'pending',
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"documents_extracted" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

-- RPA Job Executions table
CREATE TABLE "rpa_job_executions" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"execution_id" varchar(255) NOT NULL,
	"status" "execution_status" DEFAULT 'pending',
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"documents_found" integer DEFAULT 0,
	"documents_processed" integer DEFAULT 0,
	"documents_skipped" integer DEFAULT 0,
	"error_count" integer DEFAULT 0,
	"execution_log" text,
	"extracted_documents" jsonb
);

-- RPA Document Queue table
CREATE TABLE "rpa_document_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_execution_id" integer NOT NULL,
	"document_id" varchar(255) NOT NULL,
	"document_type" varchar(50) NOT NULL,
	"document_data" jsonb NOT NULL,
	"status" "document_status" DEFAULT 'pending',
	"processing_started_at" timestamp,
	"processing_completed_at" timestamp,
	"error_message" text,
	"invoice_id" integer,
	"purchase_order_id" integer,
	"created_at" timestamp DEFAULT now()
);

-- RPA Automation Rules table
CREATE TABLE "rpa_automation_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"rule_name" varchar(255) NOT NULL,
	"rule_type" varchar(100) NOT NULL,
	"conditions" jsonb NOT NULL,
	"actions" jsonb NOT NULL,
	"is_active" boolean DEFAULT true,
	"priority" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

-- Verified Invoice Project table (missing from original migration)
CREATE TABLE "verified_invoice_project" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"project_id" varchar(100) NOT NULL,
	"match_score" numeric(5, 2) NOT NULL,
	"match_details" jsonb,
	"approved_by" varchar NOT NULL,
	"approved_at" timestamp,
	"verified_at" timestamp DEFAULT now(),
	"original_match_id" integer,
	"original_approved_id" integer,
	"validation_results" jsonb,
	"created_at" timestamp DEFAULT now()
);

-- Add foreign key constraints
ALTER TABLE "erp_connections" ADD CONSTRAINT "erp_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpa_extraction_jobs" ADD CONSTRAINT "rpa_extraction_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "rpa_extraction_jobs" ADD CONSTRAINT "rpa_extraction_jobs_erp_connection_id_erp_connections_id_fk" FOREIGN KEY ("erp_connection_id") REFERENCES "public"."erp_connections"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpa_job_executions" ADD CONSTRAINT "rpa_job_executions_job_id_rpa_extraction_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."rpa_extraction_jobs"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpa_document_queue" ADD CONSTRAINT "rpa_document_queue_job_execution_id_rpa_job_executions_id_fk" FOREIGN KEY ("job_execution_id") REFERENCES "public"."rpa_job_executions"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "rpa_document_queue" ADD CONSTRAINT "rpa_document_queue_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "rpa_document_queue" ADD CONSTRAINT "rpa_document_queue_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "rpa_automation_rules" ADD CONSTRAINT "rpa_automation_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "verified_invoice_project" ADD CONSTRAINT "verified_invoice_project_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "verified_invoice_project" ADD CONSTRAINT "verified_invoice_project_project_id_projects_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("project_id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "verified_invoice_project" ADD CONSTRAINT "verified_invoice_project_original_match_id_invoice_project_matches_id_fk" FOREIGN KEY ("original_match_id") REFERENCES "public"."invoice_project_matches"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "verified_invoice_project" ADD CONSTRAINT "verified_invoice_project_original_approved_id_approved_invoice_project_id_fk" FOREIGN KEY ("original_approved_id") REFERENCES "public"."approved_invoice_project"("id") ON DELETE no action ON UPDATE no action;

-- Create indexes for better performance
CREATE INDEX "idx_erp_connections_user_id" ON "erp_connections" ("user_id");
CREATE INDEX "idx_rpa_extraction_jobs_user_id" ON "rpa_extraction_jobs" ("user_id");
CREATE INDEX "idx_rpa_extraction_jobs_erp_connection_id" ON "rpa_extraction_jobs" ("erp_connection_id");
CREATE INDEX "idx_rpa_job_executions_job_id" ON "rpa_job_executions" ("job_id");
CREATE INDEX "idx_rpa_document_queue_job_execution_id" ON "rpa_document_queue" ("job_execution_id");
CREATE INDEX "idx_rpa_automation_rules_user_id" ON "rpa_automation_rules" ("user_id");
CREATE INDEX "idx_verified_invoice_project_invoice_id" ON "verified_invoice_project" ("invoice_id");
