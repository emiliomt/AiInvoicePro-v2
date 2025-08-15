
const { storage } = require('./server/storage');

async function testDeduplication() {
  try {
    console.log('🔍 Testing deduplication for invoice 41...');
    
    // First, let's check if invoice 41 exists
    const invoice = await storage.getInvoice(41);
    if (!invoice) {
      console.log('❌ Invoice 41 not found');
      return;
    }
    
    console.log(`✅ Found invoice 41: ${invoice.fileName}`);
    
    // Get line items before deduplication
    const lineItemsBefore = await storage.getLineItemsByInvoice(41);
    console.log(`📝 Line items before deduplication: ${lineItemsBefore.length}`);
    
    // Run deduplication
    console.log('🔄 Running deduplication...');
    const result = await storage.deduplicateLineItems(41);
    
    console.log('✅ Deduplication completed:');
    console.log(`   - Duplicates removed: ${result.removed}`);
    console.log(`   - Items kept: ${result.kept}`);
    console.log(`   - Duplicate groups: ${result.details.length}`);
    
    // Get line items after deduplication
    const lineItemsAfter = await storage.getLineItemsByInvoice(41);
    console.log(`📝 Line items after deduplication: ${lineItemsAfter.length}`);
    
    // Show details if any duplicates were found
    if (result.details.length > 0) {
      console.log('\n🔍 Duplicate groups found:');
      result.details.forEach((group, index) => {
        console.log(`   Group ${index + 1}: "${group.description}" (${group.duplicateCount} duplicates, kept ${group.keptCount})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error testing deduplication:', error);
  }
}

testDeduplication();
