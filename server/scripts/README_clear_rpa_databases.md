# RPA Database Reset Script

## Overview

The `clear_rpa_databases.js` script provides a safe, comprehensive way to reset RPA-imported data while preserving manual invoices and maintaining database integrity. It includes preflight guardrails, backup functionality, and detailed reporting.

## Features

### ✅ Preflight Guardrails
- **Dry-run mode**: Preview changes without executing them
- **Confirmation requirement**: Explicit `--confirm` flag for destructive operations
- **Automatic backups**: Creates timestamped backups before any changes
- **Environment validation**: Checks database connectivity and table existence

### ✅ Safe Execution
- **Transactional operation**: All changes wrapped in single DB transaction
- **Foreign key awareness**: Handles database constraints properly
- **Idempotent operation**: Safe to run multiple times
- **Rollback on error**: Automatic rollback if any step fails

### ✅ Scoped Reset
- **Source-based filtering**: Only affects records with RPA sources (`python_rpa`, `recovery_manual`)
- **Preserves manual data**: Manual invoices and uploads remain untouched
- **Configurable modes**: Soft reset (flags only) vs hard reset (delete staging)

### ✅ Data Integrity
- **Preserves file links**: Invoice-to-PDF relationships maintained
- **Audit trail**: Logs preserved in soft mode for history
- **Integrity verification**: Post-reset database consistency checks

## Usage

### Command Line Options

```bash
# Preview changes (recommended first step)
node server/scripts/clear_rpa_databases.js --dry-run

# Soft reset - clear processing flags only
node server/scripts/clear_rpa_databases.js --confirm --mode=soft

# Hard reset - delete RPA staging data
node server/scripts/clear_rpa_databases.js --confirm --mode=hard

# Hard reset including RPA invoices (requires --force)
node server/scripts/clear_rpa_databases.js --confirm --mode=hard --include-invoices --force
```

### Parameters

| Flag | Description |
|------|-------------|
| `--dry-run` | Preview impact without making changes |
| `--confirm` | Required for all destructive operations |
| `--mode=soft\|hard` | Reset mode (default: soft) |
| `--include-invoices` | Also delete RPA invoice records (requires --force) |
| `--force` | Skip additional safety checks |

### Reset Modes

#### Soft Reset (`--mode=soft`)
- ✅ Preserves all data records
- ✅ Resets processing flags to allow reprocessing
- ✅ Maintains audit trail (logs preserved)
- ✅ Safe for production use

**What it does:**
- Sets `processing_status = 'downloaded'` for RPA files
- Clears `processed_at` timestamps
- Resets `metadata.processed = false`
- Preserves import logs and invoice records

#### Hard Reset (`--mode=hard`)  
- 🔥 Deletes RPA staging files (`imported_invoices`)
- 🔥 Deletes import logs (`invoice_importer_logs`)
- ✅ Preserves final invoice records
- ⚠️ Use with caution

**What it does:**
- Permanently deletes RPA file records
- Clears all import history
- Resets system to pre-import state
- Preserves processed invoices unless `--include-invoices` specified

## Data Flow

### Tables Affected

| Table | Soft Reset | Hard Reset | Notes |
|-------|------------|------------|--------|
| `imported_invoices` | Reset flags | Delete RPA records | Processing status reset vs deletion |
| `invoice_importer_logs` | Preserved | Deleted | Audit trail vs clean slate |
| `invoices` | Preserved | Preserved* | Final records maintained (*unless --include-invoices) |

### Identification Criteria

**RPA Records Identified By:**
- `invoices.user_id = 'rpa-system'`
- `imported_invoices.metadata->>'source' IN ('python_rpa', 'recovery_manual')`
- All `invoice_importer_logs` records (RPA-specific table)

## Safety Features

### Backup System
Automatic backups created in `backups/rpa_reset/` with format:
```
rpa_reset_2025-08-27T18-28-29-266Z_[table_name].sql
```

### Foreign Key Handling
The script correctly handles database constraints:
1. Updates/deletes `imported_invoices` first (child table)
2. Then handles `invoice_importer_logs` (parent table)
3. Preserves invoice-to-PDF link integrity

### Error Recovery
- All operations wrapped in database transaction
- Automatic rollback on any failure
- Detailed error reporting with stack traces
- Backup files preserved for manual recovery

## Output Examples

### Dry Run Output
```
📊 IMPACT SUMMARY:
   RPA Logs to clear: 7
   RPA Files to reset flags: 20
   RPA Invoices to preserve: 30
   Manual Invoices (preserved): 0
   Reset Mode: SOFT
   📝 Soft reset: Only processing flags will be cleared

📋 [DRY RUN] No changes will be made. Use --confirm to execute.
```

### Successful Execution
```
🔄 Executing RPA database reset...
   🔄 Soft reset: Clearing processing flags for RPA files...
      ✅ Reset processing flags for 20 files
   📋 Soft reset: Preserving RPA logs for history
✅ Database reset completed successfully

📋 RESET SUMMARY REPORT
==================================================
Mode: SOFT
Records Affected: 20
Duration: 0.47s
Backup Files Created: 2
🎉 RPA database reset completed successfully!
```

## Post-Reset Workflow

### After Soft Reset
1. ✅ RPA system ready to reprocess files
2. ✅ Processing flags cleared, files marked as 'downloaded'
3. ✅ Next RPA run will re-extract and re-validate data
4. ✅ No data loss, full audit trail preserved

### After Hard Reset  
1. ✅ Clean slate for RPA system
2. ✅ All staging data removed
3. ✅ Final invoices preserved (unless --include-invoices used)
4. ⚠️ Import history lost - backup files contain recovery data

### Verification Steps
The script automatically verifies:
- Database integrity (foreign key constraints)
- Manual invoice preservation
- Orphaned record detection
- Remaining RPA data counts

## Integration with RPA Pipeline

### Before Reset
```sql
-- Current state example
SELECT COUNT(*) FROM invoices WHERE user_id = 'rpa-system';           -- 30
SELECT COUNT(*) FROM imported_invoices WHERE metadata->>'source' = 'python_rpa'; -- 20
SELECT COUNT(*) FROM invoice_importer_logs;                           -- 7
```

### After Soft Reset
```sql
-- Processing flags cleared, data preserved
SELECT COUNT(*) FROM invoices WHERE user_id = 'rpa-system';           -- 30 ✅
SELECT COUNT(*) FROM imported_invoices WHERE metadata->>'source' = 'python_rpa'; -- 20 ✅
SELECT COUNT(*) FROM imported_invoices WHERE processing_status = 'downloaded'; -- 20 ✅
SELECT COUNT(*) FROM invoice_importer_logs;                           -- 7 ✅
```

### After Hard Reset
```sql
-- Staging cleared, finals preserved
SELECT COUNT(*) FROM invoices WHERE user_id = 'rpa-system';           -- 30 ✅ 
SELECT COUNT(*) FROM imported_invoices WHERE metadata->>'source' = 'python_rpa'; -- 0 ✅
SELECT COUNT(*) FROM invoice_importer_logs;                           -- 0 ✅
```

## Troubleshooting

### Common Issues

**Foreign Key Errors**
- Script handles constraint order automatically
- If issues persist, check for custom foreign keys
- Backup files available for manual recovery

**Permission Errors**
- "session_replication_role" warning is safe to ignore
- Script continues despite this non-critical error
- Full functionality maintained

**Large Dataset Warnings**
- Script includes safety limits (10,000+ records triggers warning)
- Use `--force` to bypass if needed
- Consider manual chunking for very large datasets

### Recovery Scenarios

**Accidental Hard Reset**
1. Locate backup files in `backups/rpa_reset/`
2. Restore from JSON backup data
3. Use database transaction logs if available

**Incomplete Reset**
1. Script is idempotent - safe to re-run
2. Check logs for specific error details
3. Transaction rollback ensures no partial state

## Monitoring and Alerts

### Success Indicators
- ✅ "Database reset completed successfully"
- ✅ Backup files created
- ✅ Expected record counts in summary
- ✅ Clean integrity verification

### Warning Signs
- ⚠️ "All invoices appear to be RPA-generated" - verify manual data exists
- ⚠️ Orphaned records detected - check foreign key integrity
- ❌ Transaction rollback - investigate specific error

## Best Practices

### Before Running
1. **Always start with dry-run** to preview changes
2. **Verify backup directory** has sufficient space
3. **Check current data state** to understand impact
4. **Coordinate with team** for production resets

### Production Usage
1. **Use soft reset** for most scenarios (preserves audit trail)
2. **Schedule during maintenance windows** for hard resets
3. **Monitor backup file creation** and storage
4. **Test recovery procedures** with backup files

### Testing
1. **Run integration tests** after reset
2. **Verify RPA pipeline** processes correctly
3. **Check manual invoice workflow** remains intact
4. **Validate PDF linking** functionality

This script provides a comprehensive, safe solution for RPA database management with full audit trails, backup protection, and detailed reporting.