/**
 * Test script for the Autonomous Invoice Processing Agent
 * 
 * This script demonstrates how to use the new autonomous agent
 * for end-to-end invoice processing with monitoring and error handling.
 */

const fs = require('fs');
const path = require('path');

// Configuration for testing
const TEST_CONFIG = {
  server_url: 'http://localhost:5000',
  test_user_id: 'test-user-123',
  test_file_path: './sample_invoice_data.json', // We'll use existing test data
  agent_config: {
    classification_method: 'ai',
    use_websocket_progress: true,
    enable_duplicate_detection: true,
    auto_approve_threshold: 0.95,
    timeout_seconds: 300,
    max_retries: 3,
    backoff_strategy: 'exponential',
    retry_on: ['network_error', 'timeout', 'service_unavailable']
  }
};

/**
 * Test the autonomous agent configuration endpoint
 */
async function testAgentConfig() {
  console.log('\n🤖 Testing Agent Configuration Endpoint');
  console.log('=' .repeat(50));

  try {
    const response = await fetch(`${TEST_CONFIG.server_url}/api/agent/config`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Note: In real usage, you'd need proper authentication headers
        'Authorization': 'Bearer test-token'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    console.log('✅ Agent Configuration Retrieved:');
    console.log(`   Agent Name: ${data.agent.name}`);
    console.log(`   Version: ${data.agent.version}`);
    console.log(`   Capabilities: ${data.agent.capabilities.join(', ')}`);
    console.log(`   Classification Method: ${data.config.classification_method}`);
    console.log(`   WebSocket Progress: ${data.config.use_websocket_progress}`);
    console.log(`   Max Retries: ${data.config.max_retries}`);
    
    return data;
  } catch (error) {
    console.error('❌ Failed to get agent configuration:', error.message);
    return null;
  }
}

/**
 * Test the autonomous agent processing endpoint
 */
async function testAgentProcessing() {
  console.log('\n🚀 Testing Autonomous Agent Processing');
  console.log('=' .repeat(50));

  try {
    // Create a mock invoice file buffer (base64 encoded)
    const mockInvoiceData = {
      vendor_name: "Test Vendor Inc.",
      invoice_number: "INV-001",
      date: "2024-01-15",
      total_amount: 1250.00,
      line_items: [
        {
          description: "Software Development Services",
          quantity: "1",
          unit_price: "1000.00",
          total_price: "1000.00"
        },
        {
          description: "Consulting Services",
          quantity: "10",
          unit_price: "25.00",
          total_price: "250.00"
        }
      ]
    };

    const fileBuffer = Buffer.from(JSON.stringify(mockInvoiceData));
    const base64File = fileBuffer.toString('base64');

    const requestBody = {
      file: base64File,
      fileName: 'test-invoice.json',
      config: TEST_CONFIG.agent_config,
      additionalContext: {
        source: 'test-script',
        priority: 'normal',
        expected_categories: ['software', 'consulting']
      },
      company_id: 'test-company',
      timezone: 'UTC',
      language: 'en'
    };

    console.log('📤 Sending processing request...');
    console.log(`   File Size: ${fileBuffer.length} bytes`);
    console.log(`   File Name: ${requestBody.fileName}`);
    console.log(`   Config: ${JSON.stringify(TEST_CONFIG.agent_config, null, 2)}`);

    const response = await fetch(`${TEST_CONFIG.server_url}/api/agent/process-invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Note: In real usage, you'd need proper authentication headers
        'Authorization': 'Bearer test-token'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${response.statusText}\nResponse: ${errorText}`);
    }

    const result = await response.json();
    
    console.log('\n✅ Agent Processing Completed:');
    console.log(`   Success: ${result.success}`);
    console.log(`   Final Status: ${result.result.final_status}`);
    console.log(`   Processing Time: ${result.result.processing_time_ms}ms`);
    
    if (result.result.metrics) {
      console.log('\n📊 Processing Metrics:');
      console.log(`   Classification Confidence: ${result.result.metrics.classification_confidence || 'N/A'}`);
      console.log(`   Validation Score: ${result.result.metrics.validation_score || 'N/A'}`);
      console.log(`   Match Accuracy: ${result.result.metrics.match_accuracy || 'N/A'}`);
    }

    if (result.result.step_results) {
      console.log('\n📋 Step Results:');
      const stepMap = new Map(Object.entries(result.result.step_results));
      stepMap.forEach((stepResult, stepId) => {
        console.log(`   Step ${stepId}: ${JSON.stringify(stepResult, null, 2)}`);
      });
    }

    return result;
  } catch (error) {
    console.error('❌ Agent processing failed:', error.message);
    return null;
  }
}

/**
 * Test WebSocket connection for real-time progress updates
 */
async function testWebSocketProgress() {
  console.log('\n🔌 Testing WebSocket Progress Updates');
  console.log('=' .repeat(50));

  return new Promise((resolve) => {
    try {
      const WebSocket = require('ws');
      const ws = new WebSocket(`ws://localhost:5000/ws`);

      let progressReceived = false;

      ws.on('open', () => {
        console.log('✅ WebSocket connected');
        
        // Send subscription message for agent progress
        const subscribeMessage = {
          type: 'subscribe_progress',
          sessionId: 'agent-test-session'
        };
        
        ws.send(JSON.stringify(subscribeMessage));
        console.log('📤 Sent subscription message');
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('📨 WebSocket message received:', message.type);
          
          if (message.type === 'progress_update' || message.type === 'step_progress') {
            progressReceived = true;
            console.log('📊 Progress update:', {
              percentage: message.data?.percentage || 0,
              message: message.data?.message || 'Processing...',
              step: message.data?.currentStep || 0
            });
          }
        } catch (err) {
          console.log('📨 Raw WebSocket message:', data.toString());
        }
      });

      ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error.message);
      });

      ws.on('close', () => {
        console.log('🔌 WebSocket disconnected');
        resolve(progressReceived);
      });

      // Close after 10 seconds
      setTimeout(() => {
        ws.close();
      }, 10000);

    } catch (error) {
      console.error('❌ WebSocket test failed:', error.message);
      resolve(false);
    }
  });
}

/**
 * Run comprehensive agent tests
 */
async function runComprehensiveTests() {
  console.log('🤖 AUTONOMOUS INVOICE PROCESSING AGENT - COMPREHENSIVE TEST SUITE');
  console.log('=' .repeat(80));
  console.log(`Server URL: ${TEST_CONFIG.server_url}`);
  console.log(`Test User ID: ${TEST_CONFIG.test_user_id}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('=' .repeat(80));

  const results = {
    agent_config: false,
    agent_processing: false,
    websocket_progress: false
  };

  try {
    // Test 1: Agent Configuration
    console.log('\n🧪 TEST 1: Agent Configuration');
    const configResult = await testAgentConfig();
    results.agent_config = configResult !== null;

    // Test 2: Agent Processing
    console.log('\n🧪 TEST 2: Agent Processing Workflow');
    const processingResult = await testAgentProcessing();
    results.agent_processing = processingResult !== null;

    // Test 3: WebSocket Progress (run in parallel)
    console.log('\n🧪 TEST 3: WebSocket Progress Updates');
    const wsResult = await testWebSocketProgress();
    results.websocket_progress = wsResult;

  } catch (error) {
    console.error('❌ Test suite error:', error);
  }

  // Summary
  console.log('\n📊 TEST RESULTS SUMMARY');
  console.log('=' .repeat(50));
  console.log(`✅ Agent Configuration: ${results.agent_config ? 'PASSED' : 'FAILED'}`);
  console.log(`✅ Agent Processing: ${results.agent_processing ? 'PASSED' : 'FAILED'}`);
  console.log(`✅ WebSocket Progress: ${results.websocket_progress ? 'PASSED' : 'FAILED'}`);
  
  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(Boolean).length;
  console.log(`\n🎯 Overall: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests passed! The autonomous agent is ready for production.');
  } else {
    console.log('⚠️ Some tests failed. Please check the server logs and configuration.');
  }

  return results;
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'config':
      await testAgentConfig();
      break;
    case 'process':
      await testAgentProcessing();
      break;
    case 'websocket':
      await testWebSocketProgress();
      break;
    case 'all':
    default:
      await runComprehensiveTests();
      break;
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Run the tests
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  testAgentConfig,
  testAgentProcessing,
  testWebSocketProgress,
  runComprehensiveTests
};
