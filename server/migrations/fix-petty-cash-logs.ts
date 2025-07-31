
import { db } from '../db';
import { invoices, pettyCashLog, settings } from '../../shared/schema';
import { eq, and, isNull, lt } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

interface MigrationResult {
  totalInvoicesChecked: number;
  invoicesQualifyingForPettyCash: number;
  existingLogsFound: number;
  newLogsCreated: number;
  invoicesUpdated: number;
  errors: string[];
}

async function fixPettyCashLogs(): Promise<MigrationResult> {
  const result: MigrationResult = {
    totalInvoicesChecked: 0,
    invoicesQualifyingForPettyCash: 0,
    existingLogsFound: 0,
    newLogsCreated: 0,
    invoicesUpdated: 0,
    errors: []
  };

  console.log('🔧 Starting petty cash logs migration...');

  try {
    // Get current petty cash threshold
    const thresholdSetting = await db
      .select()
      .from(settings)
      .where(eq(settings.key, 'petty_cash_threshold'))
      .limit(1);

    const threshold = thresholdSetting.length > 0 
      ? parseFloat(thresholdSetting[0].value) 
      : 400000;

    console.log(`💰 Using petty cash threshold: ${threshold} COP`);

    // Get all invoices
    const allInvoices = await db.select().from(invoices);
    result.totalInvoicesChecked = allInvoices.length;

    console.log(`📊 Found ${allInvoices.length} total invoices to check`);

    // Process each invoice
    for (const invoice of allInvoices) {
      try {
        // Determine total amount from various sources
        let amount = 0;
        
        // First try the main totalAmount field
        if (invoice.totalAmount && invoice.totalAmount !== 'null') {
          amount = parseFloat(invoice.totalAmount);
        }
        // Then try extractedData
        else if (invoice.extractedData) {
          const data = invoice.extractedData as any;
          if (data?.total_amount) {
            amount = parseFloat(data.total_amount);
          } else if (data?.totalAmount) {
            amount = parseFloat(data.totalAmount);
          }
        }

        // Skip if we can't determine amount or amount is 0
        if (amount <= 0) {
          continue;
        }

        // Check if invoice qualifies as petty cash
        const isPettyCash = amount < threshold;
        
        if (!isPettyCash) {
          continue;
        }

        result.invoicesQualifyingForPettyCash++;

        // Check if petty cash log already exists
        const existingLog = await db
          .select()
          .from(pettyCashLog)
          .where(eq(pettyCashLog.invoiceId, invoice.id))
          .limit(1);

        if (existingLog.length > 0) {
          result.existingLogsFound++;
          console.log(`✅ Log already exists for invoice ${invoice.id} (${invoice.fileName})`);
          continue;
        }

        // Create petty cash log
        const approvalNotes = `${invoice.fileName} - Vendor: ${invoice.vendorName || 'Unknown'} - Amount: ${invoice.currency || 'COP'} ${amount.toLocaleString()}`;
        
        await db.insert(pettyCashLog).values({
          invoiceId: invoice.id,
          status: 'pending_approval',
          approvalNotes: approvalNotes
        });

        result.newLogsCreated++;

        // Update invoice to mark as petty cash if not already marked
        const updates: any = {};
        let needsUpdate = false;

        if (!invoice.pettyCashFlag) {
          updates.pettyCashFlag = true;
          needsUpdate = true;
        }

        if (invoice.status === 'pending') {
          updates.status = 'petty_cash';
          needsUpdate = true;
        }

        // Update extractedData if needed
        if (invoice.extractedData) {
          const data = invoice.extractedData as any;
          if (!data.is_petty_cash) {
            data.is_petty_cash = true;
            data.petty_cash_threshold = threshold;
            data.petty_cash_amount = amount;
            updates.extractedData = data;
            needsUpdate = true;
          }
        } else {
          // Create extractedData if it doesn't exist
          updates.extractedData = {
            is_petty_cash: true,
            petty_cash_threshold: threshold,
            petty_cash_amount: amount
          };
          needsUpdate = true;
        }

        if (needsUpdate) {
          await db
            .update(invoices)
            .set(updates)
            .where(eq(invoices.id, invoice.id));
          
          result.invoicesUpdated++;
        }

        console.log(`🆕 Created petty cash log for invoice ${invoice.id} (${invoice.fileName}) - Amount: ${amount.toLocaleString()} COP`);

      } catch (error) {
        const errorMsg = `Error processing invoice ${invoice.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
    }

    // Summary
    console.log('\n📈 Migration Summary:');
    console.log(`Total invoices checked: ${result.totalInvoicesChecked}`);
    console.log(`Invoices qualifying for petty cash: ${result.invoicesQualifyingForPettyCash}`);
    console.log(`Existing logs found: ${result.existingLogsFound}`);
    console.log(`New logs created: ${result.newLogsCreated}`);
    console.log(`Invoices updated: ${result.invoicesUpdated}`);
    
    if (result.errors.length > 0) {
      console.log(`Errors encountered: ${result.errors.length}`);
      result.errors.forEach(error => console.log(`  - ${error}`));
    }

    console.log('✅ Migration completed successfully!');

  } catch (error) {
    const errorMsg = `Fatal migration error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    result.errors.push(errorMsg);
    console.error(`💥 ${errorMsg}`);
  }

  return result;
}

// Export for use in other scripts
export { fixPettyCashLogs };

// Run if called directly
if (require.main === module) {
  fixPettyCashLogs()
    .then((result) => {
      console.log('\n🎉 Migration completed with result:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    });
}
