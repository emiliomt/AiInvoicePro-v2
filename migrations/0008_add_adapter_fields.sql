-- Migration: Add Universal ERP Adapter fields to erpConnections and invoiceImporterConfigs
-- Created: 2025-01-15
-- Purpose: Support multi-tier ERP integration with API-first approach

-- Add integration_method enum type
DO $$ BEGIN
  CREATE TYPE integration_method AS ENUM (
    'api',
    'xml_polling',
    'email',
    'sftp',
    'web_portal',
    'rpa'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add erp_system enum type
DO $$ BEGIN
  CREATE TYPE erp_system AS ENUM (
    'sinco',
    'sap_b1',
    'sap_hana',
    'oracle_ebs',
    'dynamics',
    'odoo',
    'generic'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add new columns to erp_connections table
ALTER TABLE erp_connections
  ADD COLUMN IF NOT EXISTS integration_method integration_method DEFAULT 'rpa',
  ADD COLUMN IF NOT EXISTS erp_system erp_system DEFAULT 'generic',
  ADD COLUMN IF NOT EXISTS capabilities JSONB DEFAULT '{"method": "rpa", "erpSystem": "generic", "supportedFeatures": ["bulkDownload", "xmlSupport", "pdfSupport"], "reliabilityScore": 70, "averageResponseTime": 5000, "isHealthy": true}'::jsonb,
  ADD COLUMN IF NOT EXISTS adapter_config JSONB DEFAULT '{}'::jsonb;

-- Add adapter_instance_id column to invoice_importer_configs table
ALTER TABLE invoice_importer_configs
  ADD COLUMN IF NOT EXISTS adapter_instance_id VARCHAR(255);

-- Create index on integration_method for faster lookups
CREATE INDEX IF NOT EXISTS idx_erp_connections_integration_method ON erp_connections(integration_method);
CREATE INDEX IF NOT EXISTS idx_erp_connections_erp_system ON erp_connections(erp_system);

-- Update existing connections to use 'sinco' system for all connections (backward compatibility)
-- This runs after columns are added, so we update all existing rows
UPDATE erp_connections
SET erp_system = 'sinco',
    capabilities = '{"method": "rpa", "erpSystem": "sinco", "supportedFeatures": ["bulkDownload", "xmlSupport", "pdfSupport"], "reliabilityScore": 70, "averageResponseTime": 5000, "isHealthy": true}'::jsonb
WHERE erp_system = 'generic';

-- Add comment for documentation
COMMENT ON COLUMN erp_connections.integration_method IS 'The integration method used to connect to the ERP (api, xml_polling, email, sftp, web_portal, rpa)';
COMMENT ON COLUMN erp_connections.erp_system IS 'The type of ERP system (sinco, sap_b1, sap_hana, oracle_ebs, dynamics, odoo, generic)';
COMMENT ON COLUMN erp_connections.capabilities IS 'JSON object defining adapter capabilities (bulkDownload, realTimeSync, webhookSupport, xmlSupport, pdfSupport)';
COMMENT ON COLUMN erp_connections.adapter_config IS 'JSON object for adapter-specific configuration';
COMMENT ON COLUMN invoice_importer_configs.adapter_instance_id IS 'Reference to the adapter instance ID used for this import configuration';
