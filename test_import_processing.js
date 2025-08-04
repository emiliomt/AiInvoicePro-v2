#!/usr/bin/env node

// Test script to process imported invoices
import { invoiceProcessingService } from './server/services/invoiceProcessingService.js';

async function testProcessing() {
  try {
    console.log('🔄 Starting import processing test...');
    
    // Process invoices for log ID 4 (the latest import batch)
    const result = await invoiceProcessingService.processInvoicesByLogId(4);
    
    console.log('\n📊 Processing Results:');
    console.log(`✅ Processed: ${result.processed}`);
    console.log(`❌ Failed: ${result.failed}`);
    console.log(`📝 Total: ${result.processed + result.failed}`);
    
    if (result.errors.length > 0) {
      console.log('\n❌ Errors:');
      result.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }
    
    console.log('\n🎉 Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testProcessing();