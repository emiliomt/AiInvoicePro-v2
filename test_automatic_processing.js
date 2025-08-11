#!/usr/bin/env node

// Test script to verify automatic invoice processing functionality
const { invoiceProcessingService } = require('./server/services/invoiceProcessingService.js');
const { storage } = require('./server/storage.js');

async function testAutomaticProcessing() {
  console.log('🧪 Testing automatic invoice processing...');
  
  try {
    // Get existing invoices to test with
    const invoices = await storage.getInvoices('43658475'); // User from the screenshot
    
    if (invoices && invoices.length > 0) {
      const testInvoice = invoices[0];
      console.log(`📋 Testing with invoice ID: ${testInvoice.id}`);
      console.log(`📄 Invoice: ${testInvoice.fileName}`);
      console.log(`💰 Amount: ${testInvoice.totalAmount}`);
      console.log(`🏢 Vendor: ${testInvoice.vendorName}`);
      
      // Test the automatic processing
      const result = await invoiceProcessingService.processInvoiceDocumentAutomatically(
        testInvoice.id,
        '43658475', // userId
        'test-processing',
        false // don't skip validation
      );
      
      console.log(`✅ Processing result: ${result}`);
      
      // Check if petty cash log was created
      const pettyCashLogs = await storage.getPettyCashLogs();
      console.log(`💰 Petty cash logs found: ${pettyCashLogs.length}`);
      
      // Check if project matching was attempted
      const updatedInvoice = await storage.getInvoice(testInvoice.id);
      console.log(`🎯 Updated project name: ${updatedInvoice?.projectName || 'Not assigned'}`);
      
    } else {
      console.log('❌ No invoices found to test with');
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testAutomaticProcessing();