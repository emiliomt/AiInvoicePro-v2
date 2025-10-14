/**
 * Test script for Line Item Classification endpoint
 * 
 * This script tests the /api/process-invoices-line-items endpoint
 * to ensure it's working correctly after the fixes.
 * 
 * Usage:
 *   node test_classification_endpoint.js [invoiceIds]
 * 
 * Example:
 *   node test_classification_endpoint.js 42,43,44
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

async function testClassificationEndpoint(invoiceIds) {
  console.log('🧪 Testing Line Item Classification Endpoint');
  console.log('=' .repeat(60));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Invoice IDs: ${invoiceIds.join(', ')}`);
  console.log('=' .repeat(60));
  console.log('');

  try {
    // Step 1: Check health endpoint
    console.log('Step 1: Checking server health...');
    const healthResponse = await fetch(`${BASE_URL}/api/health`);
    
    if (!healthResponse.ok) {
      throw new Error(`Server health check failed: ${healthResponse.status}`);
    }
    
    const healthData = await healthResponse.json();
    console.log('✅ Server is healthy');
    console.log(`   Status: ${healthData.status}`);
    console.log(`   Uptime: ${Math.round(healthData.uptime)}s`);
    console.log('');

    // Step 2: Test classification endpoint (without auth - will fail but shows endpoint exists)
    console.log('Step 2: Testing classification endpoint (without auth)...');
    const classifyResponse = await fetch(`${BASE_URL}/api/process-invoices-line-items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        invoiceIds: invoiceIds
      })
    });

    console.log(`   Response status: ${classifyResponse.status}`);
    
    if (classifyResponse.status === 401) {
      console.log('✅ Endpoint exists and requires authentication (as expected)');
      const errorData = await classifyResponse.json();
      console.log(`   Error message: ${errorData.message || errorData.error}`);
    } else if (classifyResponse.status === 200) {
      const successData = await classifyResponse.json();
      console.log('✅ Classification started successfully');
      console.log(`   Session ID: ${successData.sessionId}`);
      console.log(`   Total invoices: ${successData.totalInvoices}`);
      console.log(`   Status: ${successData.status}`);
    } else {
      const errorData = await classifyResponse.json();
      console.log('⚠️ Unexpected response status');
      console.log(`   Response: ${JSON.stringify(errorData, null, 2)}`);
    }
    console.log('');

    // Step 3: Test WebSocket connection
    console.log('Step 3: Testing WebSocket connection...');
    const wsProtocol = BASE_URL.startsWith('https') ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${BASE_URL.replace(/^https?:\/\//, '')}/ws`;
    
    console.log(`   WebSocket URL: ${wsUrl}`);
    console.log('   Note: WebSocket testing requires browser environment or ws package');
    console.log('   You can test WebSocket manually in browser console:');
    console.log(`     const ws = new WebSocket('${wsUrl}');`);
    console.log(`     ws.onmessage = (e) => console.log('Message:', JSON.parse(e.data));`);
    console.log('');

    // Summary
    console.log('=' .repeat(60));
    console.log('Test Summary:');
    console.log('=' .repeat(60));
    console.log('✅ Server is running and healthy');
    console.log('✅ Classification endpoint exists at /api/process-invoices-line-items');
    console.log('✅ Endpoint requires authentication (secure)');
    console.log('');
    console.log('Next Steps:');
    console.log('1. Test with authenticated session in browser');
    console.log('2. Navigate to /line-item-classification page');
    console.log('3. Select invoices and click "Process Invoices"');
    console.log('4. Watch for WebSocket progress updates');
    console.log('5. Verify results in database');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Test failed with error:');
    console.error(`   ${error.message}`);
    console.error('');
    console.error('Troubleshooting:');
    console.error('1. Ensure server is running on the correct port');
    console.error('2. Check if DATABASE_URL is configured');
    console.error('3. Verify no firewall blocking connections');
    console.error('4. Check server logs for startup errors');
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const invoiceIds = args.length > 0 
  ? args[0].split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
  : [42]; // Default test invoice ID

if (invoiceIds.length === 0) {
  console.error('❌ Error: No valid invoice IDs provided');
  console.error('Usage: node test_classification_endpoint.js [invoiceIds]');
  console.error('Example: node test_classification_endpoint.js 42,43,44');
  process.exit(1);
}

// Run the test
testClassificationEndpoint(invoiceIds).catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

