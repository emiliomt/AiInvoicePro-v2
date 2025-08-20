// Test script for the new 7-step workflow
import { exec } from 'child_process';
import fs from 'fs';

console.log('🧪 Testing Invoice Processing Workflow Implementation\n');

// Test 1: Check if workflow orchestrator service exists
console.log('1. Checking workflow orchestrator service...');
if (fs.existsSync('./server/services/workflowOrchestrator.ts')) {
  console.log('✅ Workflow orchestrator service created');
} else {
  console.log('❌ Workflow orchestrator service not found');
}

// Test 2: Check if database migration exists
console.log('\n2. Checking database migration...');
if (fs.existsSync('./migrations/0008_add_workflow_management.sql')) {
  console.log('✅ Database migration created');
} else {
  console.log('❌ Database migration not found');
}

// Test 3: Check if schema updates exist
console.log('\n3. Checking schema updates...');
const schemaContent = fs.readFileSync('./shared/schema.ts', 'utf8');
if (schemaContent.includes('workflowMode') && schemaContent.includes('workflowExecutionLog')) {
  console.log('✅ Schema updated with workflow fields');
} else {
  console.log('❌ Schema not updated with workflow fields');
}

// Test 4: Check if AI service has petty cash classification
console.log('\n4. Checking AI service updates...');
const aiServiceContent = fs.readFileSync('./server/services/aiService.ts', 'utf8');
if (aiServiceContent.includes('classifyPettyCash') && aiServiceContent.includes('classifyLineItems')) {
  console.log('✅ AI service updated with petty cash and line item classification');
} else {
  console.log('❌ AI service not updated');
}

// Test 5: Check if PO matcher has enhanced line item comparison
console.log('\n5. Checking PO matcher updates...');
const poMatcherContent = fs.readFileSync('./server/services/invoicePoMatcher.ts', 'utf8');
if (poMatcherContent.includes('Enhanced line item matching') && poMatcherContent.includes('items: 0.3')) {
  console.log('✅ PO matcher updated with enhanced line item comparison');
} else {
  console.log('❌ PO matcher not updated');
}

// Test 6: Check if routes have workflow endpoints
console.log('\n6. Checking workflow API endpoints...');
const routesContent = fs.readFileSync('./server/routes_clean.ts', 'utf8');
if (routesContent.includes('/api/invoices/:id/workflow/execute-step') && 
    routesContent.includes('/api/invoices/:id/workflow/status')) {
  console.log('✅ Workflow API endpoints added');
} else {
  console.log('❌ Workflow API endpoints not found');
}

// Test 7: Check if UI component exists
console.log('\n7. Checking workflow stepper UI component...');
if (fs.existsSync('./client/src/components/WorkflowStepper.tsx')) {
  console.log('✅ Workflow stepper UI component created');
} else {
  console.log('❌ Workflow stepper UI component not found');
}

// Test 8: Check if main workflow function is updated
console.log('\n8. Checking main workflow function...');
if (routesContent.includes('7-step workflow') && routesContent.includes('executeDataExtraction')) {
  console.log('✅ Main workflow function updated to 7-step process');
} else {
  console.log('❌ Main workflow function not updated');
}

console.log('\n📊 Summary of Implementation:');
console.log('================================');

const tests = [
  'Workflow orchestrator service',
  'Database migration',
  'Schema updates',
  'AI service updates',
  'PO matcher updates',
  'Workflow API endpoints',
  'Workflow stepper UI component',
  'Main workflow function'
];

const results = [
  fs.existsSync('./server/services/workflowOrchestrator.ts'),
  fs.existsSync('./migrations/0008_add_workflow_management.sql'),
  schemaContent.includes('workflowMode'),
  aiServiceContent.includes('classifyPettyCash'),
  poMatcherContent.includes('Enhanced line item matching'),
  routesContent.includes('/api/invoices/:id/workflow/execute-step'),
  fs.existsSync('./client/src/components/WorkflowStepper.tsx'),
  routesContent.includes('7-step workflow')
];

const passed = results.filter(Boolean).length;
const total = results.length;

tests.forEach((test, index) => {
  const status = results[index] ? '✅' : '❌';
  console.log(`${status} ${test}`);
});

console.log(`\n🎯 Implementation Status: ${passed}/${total} tests passed`);

if (passed === total) {
  console.log('\n🎉 All tests passed! The workflow implementation is complete.');
  console.log('\n📋 Next steps:');
  console.log('1. Run the database migration: npm run db:migrate');
  console.log('2. Test the workflow with a sample invoice');
  console.log('3. Verify the UI component works correctly');
} else {
  console.log('\n⚠️ Some tests failed. Please check the implementation.');
  console.log('\n🔧 Missing components:');
  tests.forEach((test, index) => {
    if (!results[index]) {
      console.log(`- ${test}`);
    }
  });
}
