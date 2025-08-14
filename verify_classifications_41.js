
import { getDb } from './server/storage.js';
import { lineItems, lineItemClassifications } from './shared/schema.js';
import { eq, inArray } from 'drizzle-orm';

async function verifyClassifications() {
  try {
    const db = await getDb();
    
    console.log('🔍 Verifying line item classifications for invoice 41...\n');
    
    // Get line items for invoice 41
    const invoiceLineItems = await db
      .select()
      .from(lineItems)
      .where(eq(lineItems.invoiceId, 41));
    
    console.log(`📊 Found ${invoiceLineItems.length} line items for invoice 41`);
    
    if (invoiceLineItems.length === 0) {
      console.log('❌ No line items found for invoice 41');
      return;
    }
    
    // Get the line item IDs
    const lineItemIds = invoiceLineItems.map(item => item.id);
    
    // Count classifications for these line items
    const classifications = await db
      .select()
      .from(lineItemClassifications)
      .where(inArray(lineItemClassifications.lineItemId, lineItemIds));
    
    console.log(`🏷️ Found ${classifications.length} classifications for invoice 41 line items`);
    console.log(`   Expected: 4 classifications`);
    console.log(`   Result: ${classifications.length === 4 ? '✅ CORRECT' : '❌ INCORRECT'}\n`);
    
    // Show detailed classification info
    if (classifications.length > 0) {
      console.log('📝 Classification details:');
      for (const classification of classifications) {
        const lineItem = invoiceLineItems.find(item => item.id === classification.lineItemId);
        console.log(`   • Line Item ${classification.lineItemId}: ${lineItem?.description?.substring(0, 50)}...`);
        console.log(`     Category: ${classification.category}`);
        console.log(`     Method: ${classification.method}`);
        console.log(`     Confidence: ${classification.confidence}`);
        console.log(`     Keywords: ${classification.matchedKeywords || 'None'}\n`);
      }
    } else {
      console.log('❌ No classifications found');
      
      // Show line items that should be classified
      console.log('\n📋 Line items that need classification:');
      invoiceLineItems.forEach((item, index) => {
        console.log(`   ${index + 1}. ID: ${item.id} - ${item.description}`);
        console.log(`      Qty: ${item.quantity}, Price: ${item.totalPrice}`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    
    if (classifications.length === 4) {
      console.log('🎉 SUCCESS: All 4 line items have been classified!');
    } else {
      console.log(`⚠️  ISSUE: Expected 4 classifications, found ${classifications.length}`);
    }
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
  }
}

verifyClassifications();
