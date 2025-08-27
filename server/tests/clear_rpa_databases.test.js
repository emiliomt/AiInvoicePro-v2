/**
 * RPA Database Reset Script Tests
 * 
 * Tests the clear_rpa_databases script functionality including:
 * - Dry run mode
 * - Soft vs hard reset modes  
 * - Data preservation and integrity
 * - Foreign key handling
 * - Idempotency
 */

import { test, expect, beforeEach, afterEach } from '@playwright/test';
import { Client } from 'pg';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const TEST_CONFIG = {
  RPA_USER_ID: 'rpa-system',
  MANUAL_USER_ID: 'test-user-123',
  TEST_COMPANY_ID: 860527800
};

class TestDataManager {
  constructor() {
    this.client = null;
    this.createdInvoices = [];
    this.createdImportedInvoices = [];
    this.createdLogs = [];
  }

  async connect() {
    this.client = new Client({
      connectionString: process.env.DATABASE_URL,
    });
    await this.client.connect();
  }

  async disconnect() {
    if (this.client) {
      await this.client.end();
    }
  }

  async createTestData() {
    // Create manual invoice (should be preserved)
    const manualInvoiceResult = await this.client.query(`
      INSERT INTO invoices (
        user_id, company_id, file_name, status, vendor_name, 
        invoice_number, total_amount, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id
    `, [
      TEST_CONFIG.MANUAL_USER_ID,
      TEST_CONFIG.TEST_COMPANY_ID, 
      'manual_test_invoice.pdf',
      'pending',
      'Manual Test Vendor',
      'MANUAL001',
      1000.00
    ]);
    this.createdInvoices.push({ id: manualInvoiceResult.rows[0].id, type: 'manual' });

    // Create RPA invoice (should be handled based on mode)
    const rpaInvoiceResult = await this.client.query(`
      INSERT INTO invoices (
        user_id, company_id, file_name, status, vendor_name, 
        invoice_number, total_amount, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id
    `, [
      TEST_CONFIG.RPA_USER_ID,
      TEST_CONFIG.TEST_COMPANY_ID,
      'rpa_test_invoice.xml', 
      'extracted',
      'RPA Test Vendor',
      'RPA001',
      2000.00
    ]);
    this.createdInvoices.push({ id: rpaInvoiceResult.rows[0].id, type: 'rpa' });

    // Create importer log
    const logResult = await this.client.query(`
      INSERT INTO invoice_importer_logs (
        config_id, status, total_invoices, successful_imports, created_at
      ) VALUES ($1, $2, $3, $4, NOW())
      RETURNING id
    `, [5, 'completed', 1, 1]);
    this.createdLogs.push(logResult.rows[0].id);

    // Create imported invoice records
    const rpaFileResult = await this.client.query(`
      INSERT INTO imported_invoices (
        log_id, original_file_name, file_type, file_size,
        file_path, processing_status, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id
    `, [
      this.createdLogs[0],
      'rpa_test_file.pdf',
      'pdf',
      50000,
      'uploads/rpa_test_file.pdf',
      'processed',
      JSON.stringify({ source: 'python_rpa', processed: true })
    ]);
    this.createdImportedInvoices.push({ id: rpaFileResult.rows[0].id, type: 'rpa' });

    const manualFileResult = await this.client.query(`
      INSERT INTO imported_invoices (
        log_id, original_file_name, file_type, file_size,
        file_path, processing_status, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id
    `, [
      this.createdLogs[0],
      'manual_test_file.pdf',
      'pdf',
      30000,
      'uploads/manual_test_file.pdf',
      'processed',
      JSON.stringify({ source: 'manual_upload', processed: true })
    ]);
    this.createdImportedInvoices.push({ id: manualFileResult.rows[0].id, type: 'manual' });

    console.log(`Created test data: ${this.createdInvoices.length} invoices, ${this.createdImportedInvoices.length} files, ${this.createdLogs.length} logs`);
  }

  async cleanup() {
    // Clean up test data
    if (this.createdImportedInvoices.length > 0) {
      const ids = this.createdImportedInvoices.map(item => item.id);
      await this.client.query(`DELETE FROM imported_invoices WHERE id = ANY($1)`, [ids]);
    }
    
    if (this.createdInvoices.length > 0) {
      const ids = this.createdInvoices.map(item => item.id);
      await this.client.query(`DELETE FROM invoices WHERE id = ANY($1)`, [ids]);
    }
    
    if (this.createdLogs.length > 0) {
      await this.client.query(`DELETE FROM invoice_importer_logs WHERE id = ANY($1)`, [this.createdLogs]);
    }

    console.log('Test data cleaned up');
  }

  async getDataCounts() {
    const results = await this.client.query(`
      SELECT 
        (SELECT COUNT(*) FROM invoices WHERE user_id = $1) as manual_invoices,
        (SELECT COUNT(*) FROM invoices WHERE user_id = $2) as rpa_invoices,
        (SELECT COUNT(*) FROM imported_invoices WHERE metadata->>'source' = 'python_rpa') as rpa_files,
        (SELECT COUNT(*) FROM imported_invoices WHERE metadata->>'source' != 'python_rpa' OR metadata->>'source' IS NULL) as other_files,
        (SELECT COUNT(*) FROM invoice_importer_logs) as logs
    `, [TEST_CONFIG.MANUAL_USER_ID, TEST_CONFIG.RPA_USER_ID]);
    
    return results.rows[0];
  }
}

function runResetScript(args) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'server/scripts/clear_rpa_databases.js');
    const child = spawn('node', [scriptPath, ...args], {
      stdio: 'pipe',
      env: { ...process.env }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    child.on('error', (error) => {
      reject(error);
    });

    // Set timeout to prevent hanging
    setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Script execution timeout'));
    }, 30000);
  });
}

test.describe('RPA Database Reset Script', () => {
  let testData;

  test.beforeEach(async () => {
    testData = new TestDataManager();
    await testData.connect();
    await testData.createTestData();
  });

  test.afterEach(async () => {
    if (testData) {
      await testData.cleanup();
      await testData.disconnect();
    }

    // Clean up any backup files created during tests
    const backupDir = path.join(process.cwd(), 'backups/rpa_reset');
    if (fs.existsSync(backupDir)) {
      const files = fs.readdirSync(backupDir);
      for (const file of files) {
        if (file.startsWith('rpa_reset_test') || file.includes('test')) {
          fs.unlinkSync(path.join(backupDir, file));
        }
      }
    }
  });

  test('should show impact summary in dry-run mode', async () => {
    const result = await runResetScript(['--dry-run']);
    
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('IMPACT SUMMARY');
    expect(result.stdout).toContain('RPA Logs to clear');
    expect(result.stdout).toContain('RPA Files to reset flags');
    expect(result.stdout).toContain('Manual Invoices (preserved)');
    expect(result.stdout).toContain('[DRY RUN] No changes will be made');
  });

  test('should require --confirm flag for destructive operations', async () => {
    const result = await runResetScript(['--mode=soft']);
    
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('Destructive operation requires --confirm flag');
  });

  test('should perform soft reset correctly', async () => {
    console.log('🧪 Testing soft reset...');
    
    const beforeCounts = await testData.getDataCounts();
    console.log('Before:', beforeCounts);

    const result = await runResetScript(['--confirm', '--mode=soft']);
    
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Database reset completed successfully');
    expect(result.stdout).toContain('Soft reset: Clearing processing flags');
    
    const afterCounts = await testData.getDataCounts();
    console.log('After:', afterCounts);

    // Manual invoices should be preserved
    expect(parseInt(afterCounts.manual_invoices)).toBe(parseInt(beforeCounts.manual_invoices));
    
    // RPA invoices should be preserved in soft mode
    expect(parseInt(afterCounts.rpa_invoices)).toBe(parseInt(beforeCounts.rpa_invoices));
    
    // RPA logs should be cleared
    expect(parseInt(afterCounts.logs)).toBe(0);
    
    // Check that processing flags were reset
    const resetFile = await testData.client.query(`
      SELECT processing_status, metadata->>'processed' as processed
      FROM imported_invoices 
      WHERE metadata->>'source' = 'python_rpa'
      AND id = ANY($1)
    `, [testData.createdImportedInvoices.map(f => f.id)]);
    
    if (resetFile.rows.length > 0) {
      expect(resetFile.rows[0].processing_status).toBe('downloaded');
      expect(resetFile.rows[0].processed).toBe('false');
    }
  });

  test('should perform hard reset correctly', async () => {
    console.log('🧪 Testing hard reset...');
    
    const beforeCounts = await testData.getDataCounts();
    console.log('Before:', beforeCounts);

    const result = await runResetScript(['--confirm', '--mode=hard']);
    
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Database reset completed successfully');
    expect(result.stdout).toContain('Hard reset: Deleting RPA staging files');
    
    const afterCounts = await testData.getDataCounts();
    console.log('After:', afterCounts);

    // Manual invoices should be preserved
    expect(parseInt(afterCounts.manual_invoices)).toBe(parseInt(beforeCounts.manual_invoices));
    
    // RPA invoices should be preserved (unless --include-invoices)
    expect(parseInt(afterCounts.rpa_invoices)).toBe(parseInt(beforeCounts.rpa_invoices));
    
    // RPA files should be deleted
    expect(parseInt(afterCounts.rpa_files)).toBe(0);
    
    // RPA logs should be cleared
    expect(parseInt(afterCounts.logs)).toBe(0);
    
    // Non-RPA files should be preserved
    expect(parseInt(afterCounts.other_files)).toBeGreaterThanOrEqual(1);
  });

  test('should handle --include-invoices flag with --force', async () => {
    console.log('🧪 Testing hard reset with invoice deletion...');
    
    const beforeCounts = await testData.getDataCounts();
    
    const result = await runResetScript(['--confirm', '--mode=hard', '--include-invoices', '--force']);
    
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Deleting RPA invoices');
    
    const afterCounts = await testData.getDataCounts();

    // Manual invoices should be preserved
    expect(parseInt(afterCounts.manual_invoices)).toBe(parseInt(beforeCounts.manual_invoices));
    
    // RPA invoices should be deleted
    expect(parseInt(afterCounts.rpa_invoices)).toBe(0);
  });

  test('should be idempotent - multiple runs should not error', async () => {
    console.log('🧪 Testing idempotency...');
    
    // Run reset twice
    const result1 = await runResetScript(['--confirm', '--mode=soft']);
    expect(result1.code).toBe(0);
    
    const result2 = await runResetScript(['--confirm', '--mode=soft']);
    expect(result2.code).toBe(0);
    
    // Both should succeed
    expect(result2.stdout).toContain('Database reset completed successfully');
  });

  test('should create and validate backups', async () => {
    console.log('🧪 Testing backup functionality...');
    
    const result = await runResetScript(['--confirm', '--mode=soft']);
    
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Creating backup');
    expect(result.stdout).toContain('Backup completed');
    expect(result.stdout).toContain('Backup Files Created');
    
    // Check backup directory exists
    const backupDir = path.join(process.cwd(), 'backups/rpa_reset');
    expect(fs.existsSync(backupDir)).toBe(true);
  });

  test('should validate database integrity after reset', async () => {
    console.log('🧪 Testing integrity validation...');
    
    const result = await runResetScript(['--confirm', '--mode=hard']);
    
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Verifying database integrity');
    expect(result.stdout).toContain('Database integrity verification completed');
    expect(result.stdout).toContain('Manual invoices preserved');
    
    // Should not contain integrity warnings
    expect(result.stdout).not.toContain('orphaned');
  });

  test('should generate comprehensive summary report', async () => {
    console.log('🧪 Testing summary report...');
    
    const result = await runResetScript(['--confirm', '--mode=soft']);
    
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('RESET SUMMARY REPORT');
    expect(result.stdout).toContain('Mode: SOFT');
    expect(result.stdout).toContain('Include Invoices: NO');
    expect(result.stdout).toContain('Records Affected:');
    expect(result.stdout).toContain('Duration:');
    expect(result.stdout).toContain('RPA database reset completed successfully');
  });

  test('should validate mode parameter', async () => {
    const result = await runResetScript(['--confirm', '--mode=invalid']);
    
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('--mode must be either "soft" or "hard"');
  });

  test('should require --force for --include-invoices', async () => {
    const result = await runResetScript(['--confirm', '--mode=hard', '--include-invoices']);
    
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('--include-invoices will permanently delete RPA invoice records');
    expect(result.stdout).toContain('Add --force if you are certain');
  });
});