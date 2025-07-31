
#!/usr/bin/env tsx

import { fixPettyCashLogs } from '../server/migrations/fix-petty-cash-logs';

async function main() {
  console.log('🚀 Starting petty cash logs migration script...\n');
  
  try {
    const result = await fixPettyCashLogs();
    
    console.log('\n' + '='.repeat(60));
    console.log('📋 FINAL MIGRATION REPORT');
    console.log('='.repeat(60));
    console.log(`✨ Total invoices processed: ${result.totalInvoicesChecked}`);
    console.log(`💰 Invoices qualifying for petty cash: ${result.invoicesQualifyingForPettyCash}`);
    console.log(`📋 Existing logs found: ${result.existingLogsFound}`);
    console.log(`🆕 New logs created: ${result.newLogsCreated}`);
    console.log(`🔄 Invoices updated: ${result.invoicesUpdated}`);
    
    if (result.errors.length > 0) {
      console.log(`❌ Errors encountered: ${result.errors.length}`);
      console.log('\nError details:');
      result.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    } else {
      console.log('✅ No errors encountered');
    }
    
    console.log('='.repeat(60));
    
    if (result.newLogsCreated > 0) {
      console.log(`\n🎉 Migration successful! Created ${result.newLogsCreated} missing petty cash log entries.`);
    } else {
      console.log('\n✨ Migration completed! All petty cash logs were already present.');
    }
    
  } catch (error) {
    console.error('\n💥 Migration script failed:', error);
    process.exit(1);
  }
}

// Run the migration
main();
