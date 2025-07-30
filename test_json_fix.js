// Quick test script - Save as test_json_fix.js in your project root
const http = require('http');

console.log('🧪 Testing JSON Error Fix Implementation...\n');

// Test configuration
const BASE_URL = 'http://localhost:5000';
const tests = [
  {
    name: 'Health Check',
    path: '/api/system/health',
    method: 'GET'
  },
  {
    name: 'JSON Error Fix',
    path: '/api/invoices/fix-json-errors',
    method: 'POST'
  }
];

async function runTest(test) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: test.path,
      method: test.method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve({
            success: res.statusCode < 400,
            status: res.statusCode,
            data: response
          });
        } catch (error) {
          resolve({
            success: false,
            status: res.statusCode,
            error: 'Invalid JSON response',
            data: data.substring(0, 200)
          });
        }
      });
    });

    req.on('error', (error) => {
      resolve({
        success: false,
        error: error.message
      });
    });

    req.setTimeout(5000, () => {
      req.destroy();
      resolve({
        success: false,
        error: 'Request timeout'
      });
    });

    if (test.method === 'POST') {
      req.write('{}');
    }

    req.end();
  });
}

async function runAllTests() {
  console.log('🚀 Starting tests...\n');

  let passedTests = 0;
  let totalTests = tests.length;

  for (const test of tests) {
    process.stdout.write(`📝 ${test.name}... `);

    const result = await runTest(test);

    if (result.success) {
      console.log('✅ PASSED');
      passedTests++;

      if (test.name === 'Health Check' && result.data) {
        console.log(`   Status: ${result.data.status}`);
        console.log(`   Services: ${JSON.stringify(result.data.services)}`);
      }

      if (test.name === 'JSON Error Fix' && result.data) {
        console.log(`   Found: ${result.data.processedCount || 0} invoices to fix`);
      }
    } else {
      console.log('❌ FAILED');
      console.log(`   Error: ${result.error || 'Unknown error'}`);
      console.log(`   Status: ${result.status || 'No response'}`);
    }

    console.log('');
  }

  // Results summary
  console.log('📊 Test Results:');
  console.log('═'.repeat(40));
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${totalTests - passedTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

  if (passedTests === totalTests) {
    console.log('\n🎉 All tests passed! Your JSON error fix is ready.');
    console.log('\n🎯 Next steps:');
    console.log('1. Monitor invoice CONS5552 - it should process successfully now');
    console.log('2. Check the health endpoint regularly: GET /api/system/health');
    console.log('3. Use the fix endpoint for any future JSON errors: POST /api/invoices/fix-json-errors');
  } else {
    console.log('\n⚠️ Some tests failed. Check the errors above.');
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Make sure your server is running on port 5000');
    console.log('2. Check that all new endpoints are added to routes.ts');
    console.log('3. Verify the enhanced aiService.ts is in place');
    console.log('4. Check server logs for any startup errors');
  }
}

// Run the tests
runAllTests().catch(console.error);