import fetch from 'node-fetch';

const API_BASE = 'http://localhost:5000/api';

async function testClassificationSystem() {
  console.log('🔄 Testing Line Item Classification System...\n');

  try {
    // Test 1: Get categories
    console.log('1. Testing categories endpoint...');
    const categoriesResponse = await fetch(`${API_BASE}/classification/categories`);
    if (categoriesResponse.ok) {
      const categories = await categoriesResponse.json();
      console.log('✅ Categories loaded:', Object.keys(categories).length, 'categories');
    } else {
      console.log('❌ Failed to fetch categories');
      return;
    }

    // Test 2: Single classification
    console.log('\n2. Testing single item classification...');
    const testItem = {
      description: 'Cemento portland 50kg para construcción',
      quantity: 10,
      unitPrice: 25000,
      unit: 'sacos'
    };

    const classifyResponse = await fetch(`${API_BASE}/classification/classify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testItem)
    });

    if (classifyResponse.ok) {
      const result = await classifyResponse.json();
      console.log('✅ Single classification successful:');
      console.log(`   Category: ${result.category}`);
      console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`   Method: ${result.method}`);
      if (result.reasoning) {
        console.log(`   Reasoning: ${result.reasoning}`);
      }
    } else {
      const error = await classifyResponse.text();
      console.log('❌ Single classification failed:', error);
    }

    // Test 3: Batch classification
    console.log('\n3. Testing batch classification...');
    const batchItems = [
      { description: 'Cemento portland 50kg' },
      { description: 'Servicios de consultoría ingeniería' },
      { description: 'Taladro industrial Bosch' },
      { description: 'Combustible diesel para equipos' }
    ];

    const batchResponse = await fetch(`${API_BASE}/classification/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        lineItems: batchItems,
        vendorContext: {
          vendorName: 'ACME Construction',
          industry: 'Construction'
        }
      })
    });

    if (batchResponse.ok) {
      const batchResult = await batchResponse.json();
      console.log(`✅ Batch classification successful (${batchResult.results.length} items):`);
      
      batchResult.results.forEach((result, index) => {
        console.log(`   ${index + 1}. "${batchItems[index].description}"`);
        console.log(`      → ${result.category} (${(result.confidence * 100).toFixed(1)}%, ${result.method})`);
      });
    } else {
      const error = await batchResponse.text();
      console.log('❌ Batch classification failed:', error);
    }

    // Test 4: Test endpoint
    console.log('\n4. Testing system test endpoint...');
    const testResponse = await fetch(`${API_BASE}/classification/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (testResponse.ok) {
      const testResult = await testResponse.json();
      console.log(`✅ System test successful (${testResult.results.length} test items):`);
      
      testResult.results.forEach((result, index) => {
        console.log(`   ${index + 1}. "${result.item.description}"`);
        console.log(`      → ${result.classification.category} (${(result.classification.confidence * 100).toFixed(1)}%, ${result.classification.method})`);
      });
    } else {
      const error = await testResponse.text();
      console.log('❌ System test failed:', error);
    }

    console.log('\n🎉 Classification system test completed!');

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

// Run the test
testClassificationSystem();