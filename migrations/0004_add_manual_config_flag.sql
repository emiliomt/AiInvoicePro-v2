
-- Add manual configuration flag to invoice importer configs
ALTER TABLE "invoice_importer_configs" 
ADD COLUMN "is_manual_config" boolean DEFAULT false;
