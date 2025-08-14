
import { getDb } from './server/storage.js';
import { lineItems, invoices } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function verifyInvoice41() {
  try {
    const db = await getDb();
    
    console.log('🔍 Verifying Invoice 41...\n');
    
    // Check line items count
    const lineItemsCount = await db
      .select()
      .from(lineItems)
      .where(eq(lineItems.invoiceId, 41));
    
    console.log(`📊 Line items count for invoice 41: ${lineItemsCount.length}`);
    console.log(`   Expected: 4 items (after duplicate removal)`);
    console.log(`   Result: ${lineItemsCount.length === 4 ? '✅ CORRECT' : '❌ INCORRECT'}\n`);
    
    // Show the line items
    console.log('📝 Line items:');
    lineItemsCount.forEach((item, index) => {
      console.log(`   ${index + 1}. ${item.description} (Qty: ${item.quantity}, Price: ${item.totalPrice})`);
    });
    
    // Check invoice status
    const invoice = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, 41))
      .limit(1);
    
    if (invoice.length > 0) {
      console.log(`\n📋 Invoice 41 status: ${invoice[0].status}`);
      console.log(`   Expected: 'classified'`);
      console.log(`   Result: ${invoice[0].status === 'classified' ? '✅ CORRECT' : '❌ INCORRECT'}`);
      
      if (invoice[0].processingStatus) {
        console.log(`📋 Processing status: ${invoice[0].processingStatus}`);
      }
    } else {
      console.log('\n❌ Invoice 41 not found!');
    }
    
    console.log('\n' + '='.repeat(50));
    
    if (lineItemsCount.length === 4 && invoice[0]?.status === 'classified') {
      console.log('🎉 SUCCESS: Duplicates removed and status updated correctly!');
    } else {
      console.log('⚠️  Issues detected:');
      if (lineItemsCount.length !== 4) {
        console.log(`   - Line items count is ${lineItemsCount.length}, expected 4`);
      }
      if (invoice[0]?.status !== 'classified') {
        console.log(`   - Status is '${invoice[0]?.status}', expected 'classified'`);
      }
    }
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
  }
}

verifyInvoice41();
