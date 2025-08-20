-- Migration: Add workflow tracking fields
-- Date: 2024-01-XX

-- Add workflow tracking fields to invoices table
ALTER TABLE invoices 
ADD COLUMN workflow_mode VARCHAR(20) DEFAULT 'automatic',
ADD COLUMN current_workflow_step INTEGER DEFAULT 1,
ADD COLUMN workflow_completed_at TIMESTAMP;

-- Create workflow execution log table
CREATE TABLE workflow_execution_log (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  step_name VARCHAR(100) NOT NULL,
  step_number INTEGER NOT NULL,
  execution_mode VARCHAR(20) DEFAULT 'automatic',
  status VARCHAR(50) NOT NULL,
  result JSONB,
  error_message TEXT,
  execution_time_ms INTEGER,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_invoices_workflow_step ON invoices(current_workflow_step);
CREATE INDEX idx_workflow_execution_log_invoice ON workflow_execution_log(invoice_id);
CREATE INDEX idx_workflow_execution_log_step ON workflow_execution_log(step_number);
CREATE INDEX idx_workflow_execution_log_status ON workflow_execution_log(status);

-- Add comments for documentation
COMMENT ON COLUMN invoices.workflow_mode IS 'Workflow execution mode: automatic or manual';
COMMENT ON COLUMN invoices.current_workflow_step IS 'Current step in the 7-step workflow (1-7)';
COMMENT ON COLUMN invoices.workflow_completed_at IS 'Timestamp when workflow was completed';
COMMENT ON TABLE workflow_execution_log IS 'Log of workflow step executions for audit and debugging';
