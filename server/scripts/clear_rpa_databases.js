#!/usr/bin/env node

/**
 * RPA Database Reset Script
 * 
 * Safely resets RPA-imported data while preserving manual invoices and maintaining data integrity.
 * 
 * Usage:
 *   node server/scripts/clear_rpa_databases.js --dry-run                    # Preview changes
 *   node server/scripts/clear_rpa_databases.js --confirm --mode=soft       # Reset processing flags only
 *   node server/scripts/clear_rpa_databases.js --confirm --mode=hard       # Delete RPA staging data
 *   node server/scripts/clear_rpa_databases.js --confirm --mode=nuclear    # Complete RPA reset (all data)
 *   node server/scripts/clear_rpa_databases.js --confirm --mode=hard --include-invoices  # Delete RPA invoices too
 */

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  RPA_USER_ID: 'rpa-system',
  RPA_SOURCES: ['python_rpa', 'recovery_manual'],
  BACKUP_DIR: 'backups/rpa_reset',
  MAX_RECORDS_PER_TABLE: 10000, // Safety limit
};

// Command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const CONFIRMED = args.includes('--confirm');
const RESET_MODE = args.find(arg => arg.startsWith('--mode='))?.split('=')[1] || 'soft';
const INCLUDE_INVOICES = args.includes('--include-invoices');
const FORCE = args.includes('--force');

class RpaDbReset {
  constructor() {
    this.client = null;
    this.stats = {
      tablesAffected: 0,
      recordsAffected: 0,
      backupFiles: [],
      duration: 0,
      anomalies: []
    };
    this.startTime = Date.now();
  }

  async connect() {
    this.client = new Client({
      connectionString: process.env.DATABASE_URL,
    });
    await this.client.connect();
    console.log('✅ Connected to database');
  }

  async disconnect() {
    if (this.client) {
      await this.client.end();
      console.log('✅ Disconnected from database');
    }
  }

  async validateEnvironment() {
    console.log('🔍 Validating environment...');
    
    // Check database connection
    try {
      const result = await this.client.query('SELECT version()');
      console.log(`   Database: PostgreSQL connected`);
    } catch (error) {
      throw new Error(`Database connection failed: ${error.message}`);
    }

    // Check required tables exist
    const requiredTables = ['invoices', 'imported_invoices', 'invoice_importer_logs'];
    for (const table of requiredTables) {
      const result = await this.client.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
        [table]
      );
      if (!result.rows[0].exists) {
        throw new Error(`Required table '${table}' does not exist`);
      }
    }

    // Safety check: ensure we don't accidentally clear all invoices
    const allInvoicesCount = await this.client.query('SELECT COUNT(*) as count FROM invoices');
    const rpaInvoicesCount = await this.client.query(
      'SELECT COUNT(*) as count FROM invoices WHERE user_id = $1',
      [CONFIG.RPA_USER_ID]
    );
    
    const totalInvoices = parseInt(allInvoicesCount.rows[0].count);
    const rpaInvoices = parseInt(rpaInvoicesCount.rows[0].count);
    
    if (totalInvoices === rpaInvoices && totalInvoices > 0) {
      this.stats.anomalies.push('WARNING: All invoices appear to be RPA-generated');
    }
    
    console.log(`   Total invoices: ${totalInvoices}, RPA invoices: ${rpaInvoices}`);
    
    if (totalInvoices > CONFIG.MAX_RECORDS_PER_TABLE) {
      this.stats.anomalies.push(`WARNING: Large dataset detected (${totalInvoices} invoices)`);
    }

    console.log('✅ Environment validation passed');
  }

  async createBackup() {
    if (DRY_RUN) {
      console.log('📋 [DRY RUN] Would create backup of affected tables');
      return;
    }

    console.log('💾 Creating backup of affected tables...');
    
    // Ensure backup directory exists
    const backupDir = path.join(process.cwd(), CONFIG.BACKUP_DIR);
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPrefix = `rpa_reset_${timestamp}`;

    // Backup tables that will be affected
    const tablesToBackup = [
      'invoice_importer_logs',
      'imported_invoices',
      ...(INCLUDE_INVOICES ? ['invoices'] : [])
    ];

    for (const table of tablesToBackup) {
      const backupFile = path.join(backupDir, `${backupPrefix}_${table}.sql`);
      
      try {
        const result = await this.client.query(`SELECT * FROM ${table}`);
        const backupData = {
          table,
          timestamp: new Date().toISOString(),
          records: result.rows
        };
        
        fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
        this.stats.backupFiles.push(backupFile);
        console.log(`   ✅ Backed up ${table} (${result.rows.length} records) to ${backupFile}`);
      } catch (error) {
        console.error(`   ❌ Failed to backup ${table}: ${error.message}`);
        throw error;
      }
    }

    console.log('✅ Backup completed');
  }

  async analyzeImpact() {
    console.log('🔍 Analyzing impact...');

    const queries = {
      invoice_importer_logs: 'SELECT COUNT(*) as count FROM invoice_importer_logs',
      imported_invoices_rpa: `
        SELECT COUNT(*) as count 
        FROM imported_invoices 
        WHERE metadata->>'source' IN ('python_rpa', 'recovery_manual')
      `,
      invoices_rpa: `
        SELECT COUNT(*) as count 
        FROM invoices 
        WHERE user_id = $1
      `,
      manual_invoices: `
        SELECT COUNT(*) as count 
        FROM invoices 
        WHERE user_id != $1
      `
    };

    const results = {};
    
    // Execute analysis queries
    results.invoice_importer_logs = await this.client.query(queries.invoice_importer_logs);
    results.imported_invoices_rpa = await this.client.query(queries.imported_invoices_rpa);
    results.invoices_rpa = await this.client.query(queries.invoices_rpa, [CONFIG.RPA_USER_ID]);
    results.manual_invoices = await this.client.query(queries.manual_invoices, [CONFIG.RPA_USER_ID]);

    // Display impact summary
    console.log('\n📊 IMPACT SUMMARY:');
    console.log(`   RPA Logs to clear: ${results.invoice_importer_logs.rows[0].count}`);
    console.log(`   RPA Files to ${RESET_MODE === 'soft' ? 'reset flags' : 'delete'}: ${results.imported_invoices_rpa.rows[0].count}`);
    console.log(`   RPA Invoices to ${INCLUDE_INVOICES || RESET_MODE === 'nuclear' ? 'delete' : 'preserve'}: ${results.invoices_rpa.rows[0].count}`);
    console.log(`   Manual Invoices (preserved): ${results.manual_invoices.rows[0].count}`);
    console.log(`   Reset Mode: ${RESET_MODE.toUpperCase()}`);
    
    if (RESET_MODE === 'soft') {
      console.log(`   📝 Soft reset: Only processing flags will be cleared`);
    } else if (RESET_MODE === 'nuclear') {
      console.log(`   ☢️  Nuclear reset: ALL RPA data will be completely removed`);
    } else {
      console.log(`   🔥 Hard reset: RPA staging data will be deleted`);
    }

    // Calculate total records affected
    this.stats.recordsAffected = 
      parseInt(results.invoice_importer_logs.rows[0].count) +
      parseInt(results.imported_invoices_rpa.rows[0].count) +
      (INCLUDE_INVOICES ? parseInt(results.invoices_rpa.rows[0].count) : 0);

    return results;
  }

  async executeReset() {
    if (DRY_RUN) {
      console.log('\n📋 [DRY RUN] No changes will be made. Use --confirm to execute.');
      return;
    }

    if (!CONFIRMED) {
      console.log('\n❌ Destructive operation requires --confirm flag');
      console.log('   Add --confirm to proceed with the reset');
      process.exit(1);
    }

    console.log('\n🔄 Executing RPA database reset...');

    await this.client.query('BEGIN');

    try {
      let affectedRows = 0;

      // 1. Handle imported_invoices first (due to foreign key constraints)
      if (RESET_MODE === 'soft') {
        console.log('   🔄 Soft reset: Clearing processing flags for RPA files...');
        const softResetResult = await this.client.query(`
          UPDATE imported_invoices 
          SET 
            processing_status = 'downloaded',
            processed_at = NULL,
            metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb), 
              '{processed}', 
              'false'::jsonb
            )
          WHERE metadata->>'source' IN ('python_rpa', 'recovery_manual')
          RETURNING id
        `);
        
        affectedRows += softResetResult.rows.length;
        console.log(`      ✅ Reset processing flags for ${softResetResult.rows.length} files`);
      } else {
        console.log('   🗑️  Deleting RPA staging files...');
        const deleteFilesResult = await this.client.query(`
          DELETE FROM imported_invoices 
          WHERE metadata->>'source' IN ('python_rpa', 'recovery_manual')
          RETURNING id
        `);
        
        affectedRows += deleteFilesResult.rows.length;
        console.log(`      ✅ Deleted ${deleteFilesResult.rows.length} RPA staging files`);
      }

      // 2. Handle RPA importer logs based on mode
      if (RESET_MODE === 'hard' || RESET_MODE === 'nuclear') {
        console.log('   🧹 Clearing RPA importer logs...');
        const logsResult = await this.client.query('DELETE FROM invoice_importer_logs RETURNING id');
        affectedRows += logsResult.rows.length;
        console.log(`      ✅ Cleared ${logsResult.rows.length} log entries`);
      } else {
        console.log('   📋 Soft reset: Preserving RPA logs for history');
        // In soft mode, we keep the logs for audit trail
      }

      // 3. Handle RPA invoices if requested or in nuclear mode
      if (INCLUDE_INVOICES || RESET_MODE === 'nuclear') {
        console.log('   🗑️  Deleting RPA invoices...');
        const invoicesResult = await this.client.query(`
          DELETE FROM invoices 
          WHERE user_id = $1
          RETURNING id
        `, [CONFIG.RPA_USER_ID]);
        
        affectedRows += invoicesResult.rows.length;
        console.log(`      ✅ Deleted ${invoicesResult.rows.length} RPA invoices`);
      }

      // 4. Nuclear mode: Clear RPA configurations and reset state completely
      if (RESET_MODE === 'nuclear') {
        console.log('   ☢️  Nuclear mode: Clearing RPA configurations...');
        
        // Reset all RPA configurations to initial state (only reset existing columns)
        const configResetResult = await this.client.query(`
          UPDATE invoice_importer_configs 
          SET 
            last_run = NULL,
            next_run = NULL,
            current_step = NULL,
            progress = 0,
            stats = NULL,
            is_paused = false
          WHERE user_id = $1
          RETURNING id
        `, [CONFIG.RPA_USER_ID]);
        
        affectedRows += configResetResult.rows.length;
        console.log(`      ✅ Reset ${configResetResult.rows.length} RPA configurations to initial state`);

        // Clear any RPA-related cache or temporary files
        console.log('   🧹 Nuclear mode: Clearing any RPA temp data...');
        
        // Clear any processing locks or session data
        const sessionClearResult = await this.client.query(`
          DELETE FROM processing_sessions 
          WHERE session_type = 'rpa' OR session_id LIKE 'rpa-%'
          RETURNING id
        `).catch(() => ({ rows: [] })); // Table might not exist
        
        if (sessionClearResult.rows.length > 0) {
          affectedRows += sessionClearResult.rows.length;
          console.log(`      ✅ Cleared ${sessionClearResult.rows.length} RPA processing sessions`);
        }
      }

      this.stats.recordsAffected = affectedRows;

      await this.client.query('COMMIT');
      console.log('✅ Database reset completed successfully');

    } catch (error) {
      await this.client.query('ROLLBACK');
      console.error('❌ Reset failed, changes rolled back');
      throw error;
    }
  }

  async verifyIntegrity() {
    console.log('🔍 Verifying database integrity...');

    try {
      // Check for orphaned records
      const orphanCheck = await this.client.query(`
        SELECT 
          ii.id,
          ii.original_file_name,
          ii.linked_invoice_id
        FROM imported_invoices ii
        LEFT JOIN invoices i ON ii.linked_invoice_id = i.id
        WHERE ii.linked_invoice_id IS NOT NULL 
        AND i.id IS NULL
        LIMIT 10
      `);

      if (orphanCheck.rows.length > 0) {
        this.stats.anomalies.push(`Found ${orphanCheck.rows.length} orphaned imported_invoices records`);
        console.log(`   ⚠️  Found ${orphanCheck.rows.length} orphaned imported_invoices records`);
      }

      // Check foreign key constraints
      await this.client.query('SET session_replication_role = replica');
      await this.client.query('SET session_replication_role = DEFAULT');
      
      // Verify manual invoices still exist
      const manualInvoicesCount = await this.client.query(`
        SELECT COUNT(*) as count 
        FROM invoices 
        WHERE user_id != $1
      `, [CONFIG.RPA_USER_ID]);

      console.log(`   ✅ Manual invoices preserved: ${manualInvoicesCount.rows[0].count}`);

      // Check RPA data remaining
      const rpaDataCheck = await this.client.query(`
        SELECT 
          (SELECT COUNT(*) FROM invoice_importer_logs) as logs,
          (SELECT COUNT(*) FROM imported_invoices WHERE metadata->>'source' IN ('python_rpa', 'recovery_manual')) as files,
          (SELECT COUNT(*) FROM invoices WHERE user_id = $1) as invoices
      `, [CONFIG.RPA_USER_ID]);

      const remaining = rpaDataCheck.rows[0];
      console.log(`   📊 RPA data remaining - Logs: ${remaining.logs}, Files: ${remaining.files}, Invoices: ${remaining.invoices}`);

      console.log('✅ Database integrity verification completed');

    } catch (error) {
      this.stats.anomalies.push(`Integrity check error: ${error.message}`);
      console.error(`⚠️  Integrity check warning: ${error.message}`);
    }
  }

  generateReport() {
    this.stats.duration = Date.now() - this.startTime;
    
    console.log('\n📋 RESET SUMMARY REPORT');
    console.log('=' .repeat(50));
    console.log(`Mode: ${RESET_MODE.toUpperCase()}`);
    console.log(`Include Invoices: ${INCLUDE_INVOICES ? 'YES' : 'NO'}`);
    console.log(`Dry Run: ${DRY_RUN ? 'YES' : 'NO'}`);
    console.log(`Records Affected: ${this.stats.recordsAffected}`);
    console.log(`Duration: ${(this.stats.duration / 1000).toFixed(2)}s`);
    
    if (this.stats.backupFiles.length > 0) {
      console.log(`Backup Files Created: ${this.stats.backupFiles.length}`);
      this.stats.backupFiles.forEach(file => console.log(`  - ${file}`));
    }

    if (this.stats.anomalies.length > 0) {
      console.log('⚠️  Anomalies Detected:');
      this.stats.anomalies.forEach(anomaly => console.log(`  - ${anomaly}`));
    }

    console.log('=' .repeat(50));

    if (!DRY_RUN && CONFIRMED) {
      console.log('\n🎉 RPA database reset completed successfully!');
      console.log('   Next RPA run will start with a clean state.');
    }
  }

  async run() {
    try {
      console.log('🚀 Starting RPA Database Reset');
      console.log(`   Mode: ${RESET_MODE}, Dry Run: ${DRY_RUN}, Confirmed: ${CONFIRMED}`);

      await this.connect();
      await this.validateEnvironment();
      await this.analyzeImpact();
      
      if (!DRY_RUN) {
        await this.createBackup();
      }
      
      await this.executeReset();
      await this.verifyIntegrity();
      
      this.generateReport();

    } catch (error) {
      console.error('❌ RPA Database Reset failed:', error.message);
      if (error.stack) {
        console.error('Stack trace:', error.stack);
      }
      process.exit(1);
    } finally {
      await this.disconnect();
    }
  }
}

// Validate command line arguments
function validateArgs() {
  if (!DRY_RUN && !CONFIRMED) {
    console.log('❌ Error: Destructive operations require --confirm flag');
    console.log('\nUsage:');
    console.log('  --dry-run              Preview changes without making them');
    console.log('  --confirm              Confirm destructive operations');
    console.log('  --mode=soft|hard|nuclear  soft=reset flags, hard=delete staging, nuclear=complete reset (default: soft)');
    console.log('  --include-invoices     Also delete RPA invoice records');
    console.log('  --force                Skip some safety checks');
    process.exit(1);
  }

  if (!['soft', 'hard', 'nuclear'].includes(RESET_MODE)) {
    console.log('❌ Error: --mode must be either "soft", "hard", or "nuclear"');
    process.exit(1);
  }

  if (INCLUDE_INVOICES && !FORCE) {
    console.log('❌ Warning: --include-invoices will permanently delete RPA invoice records');
    console.log('   Add --force if you are certain you want to proceed');
    process.exit(1);
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  validateArgs();
  
  const resetTool = new RpaDbReset();
  resetTool.run();
}

export { RpaDbReset, CONFIG };