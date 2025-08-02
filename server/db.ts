import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../shared/schema";
import { sql } from "drizzle-orm";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const client = postgres(process.env.DATABASE_URL);
export const db = drizzle(client, { schema });

// Apply invoice importer migration on startup
async function ensureInvoiceImporterTables() {
  try {
    // Create enums if they don't exist
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE "file_type" AS ENUM('xml', 'pdf', 'both');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE "schedule_type" AS ENUM('once', 'daily', 'weekly', 'hourly', 'multiple_daily');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE "importer_status" AS ENUM('pending', 'running', 'completed', 'failed', 'scheduled');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create validation rule enums
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE "validation_rule_type" AS ENUM('required', 'regex', 'range', 'enum', 'format', 'comparison');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE "validation_severity" AS ENUM('low', 'medium', 'high', 'critical');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Create validation rules table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "validation_rules" (
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
    `);

    // Create settings table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "settings" (
        "id" serial PRIMARY KEY NOT NULL,
        "key" varchar(100) UNIQUE NOT NULL,
        "value" text NOT NULL,
        "description" text,
        "updated_at" timestamp DEFAULT now()
      );
    `);

    // Create invoice importer tables
    await db.execute(sql`
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
    `);

    await db.execute(sql`
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
    `);

    await db.execute(sql`
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
    `);

    // Add foreign key constraints if they don't exist
    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE "invoice_importer_configs" ADD CONSTRAINT "invoice_importer_configs_connection_id_erp_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "erp_connections"("id") ON DELETE no action ON UPDATE no action;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE "invoice_importer_logs" ADD CONSTRAINT "invoice_importer_logs_config_id_invoice_importer_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "invoice_importer_configs"("id") ON DELETE no action ON UPDATE no action;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE "imported_invoices" ADD CONSTRAINT "imported_invoices_log_id_invoice_importer_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "invoice_importer_logs"("id") ON DELETE no action ON UPDATE no action;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    console.log("Invoice importer tables ensured");
  } catch (error) {
    console.error("Error ensuring invoice importer tables:", error);
  }
}

// Run migration on module load
ensureInvoiceImporterTables();