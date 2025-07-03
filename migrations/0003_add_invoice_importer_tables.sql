
-- Add invoice importer configuration table
CREATE TABLE IF NOT EXISTS "invoice_importer_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"company_id" integer,
	"connection_id" integer NOT NULL,
	"task_name" varchar(255) NOT NULL,
	"description" text,
	"file_types" "file_type" DEFAULT 'both',
	"schedule_type" "schedule_type" DEFAULT 'once',
	"schedule_time" varchar(50),
	"schedule_day" varchar(20),
	"is_active" boolean DEFAULT true,
	"last_run" timestamp,
	"next_run" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

-- Add invoice importer logs table
CREATE TABLE IF NOT EXISTS "invoice_importer_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"config_id" integer NOT NULL,
	"status" "importer_status" DEFAULT 'pending',
	"total_invoices" integer DEFAULT 0,
	"processed_invoices" integer DEFAULT 0,
	"successful_imports" integer DEFAULT 0,
	"failed_imports" integer DEFAULT 0,
	"logs" text,
	"error_message" text,
	"execution_time" integer,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);

-- Add imported invoices table
CREATE TABLE IF NOT EXISTS "imported_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"log_id" integer NOT NULL,
	"original_file_name" varchar(255) NOT NULL,
	"file_type" varchar(10) NOT NULL,
	"file_size" integer,
	"file_path" varchar(500),
	"erp_document_id" varchar(255),
	"downloaded_at" timestamp,
	"processed_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);

-- Add enums if they don't exist
DO $$ BEGIN
	CREATE TYPE "file_type" AS ENUM('xml', 'pdf', 'both');
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
	CREATE TYPE "schedule_type" AS ENUM('once', 'daily', 'weekly', 'hourly', 'multiple_daily');
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
	CREATE TYPE "importer_status" AS ENUM('pending', 'running', 'completed', 'failed', 'scheduled');
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;

-- Add foreign key constraints
ALTER TABLE "invoice_importer_configs" ADD CONSTRAINT "invoice_importer_configs_connection_id_erp_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "erp_connections"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "invoice_importer_logs" ADD CONSTRAINT "invoice_importer_logs_config_id_invoice_importer_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "invoice_importer_configs"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "imported_invoices" ADD CONSTRAINT "imported_invoices_log_id_invoice_importer_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "invoice_importer_logs"("id") ON DELETE no action ON UPDATE no action;
