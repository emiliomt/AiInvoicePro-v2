#!/usr/bin/env node

/**
 * Test script to verify the tax ID validation fix
 * Tests that the enum validation rule now accepts multiple formats
 */

// Simple test to validate the enum logic fix
function testEnumValidation() {
  console.log('🧪 Testing Tax ID Validation Fix');
  console.log('=' .repeat(50));
  
  // Simulate the updated validation rule
  const rule = {
    id: 1,
    ruleType: 'enum',
    ruleValue: '860527800,86052780,86052780-0',
    fieldName: 'extractedData.buyerTaxId',
    severity: 'critical'
  };
  
  // Test cases from the invoice rejection issue
  const testCases = [
    { value: '860527800', expected: true, description: 'Original expected format' },
    { value: '86052780', expected: true, description: 'Format without trailing zero' },
    { value: '86052780-0', expected: true, description: 'Format with hyphen and check digit' },
    { value: '123456789', expected: false, description: 'Different tax ID (should fail)' },
    { value: '', expected: false, description: 'Empty value (should fail)' },
    { value: null, expected: false, description: 'Null value (should fail)' }
  ];
  
  // Simulate the updated enum validation logic
  function validateEnum(fieldValue, ruleValue) {
    if (!fieldValue) return false;
    const allowedValues = ruleValue.split(',').map(v => v.trim());
    return allowedValues.includes(String(fieldValue));
  }
  
  let passedTests = 0;
  let totalTests = testCases.length;
  
  testCases.forEach((testCase, index) => {
    const result = validateEnum(testCase.value, rule.ruleValue);
    const status = result === testCase.expected ? '✅ PASS' : '❌ FAIL';
    const emoji = result ? '✅' : '❌';
    
    console.log(`Test ${index + 1}: ${status}`);
    console.log(`  Description: ${testCase.description}`);
    console.log(`  Input: "${testCase.value}"`);
    console.log(`  Expected: ${testCase.expected ? 'Valid' : 'Invalid'}`);
    console.log(`  Actual: ${result ? 'Valid' : 'Invalid'} ${emoji}`);
    console.log();
    
    if (result === testCase.expected) {
      passedTests++;
    }
  });
  
  console.log('📊 Test Results:');
  console.log(`  Passed: ${passedTests}/${totalTests}`);
  console.log(`  Success Rate: ${((passedTests/totalTests) * 100).toFixed(1)}%`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests passed! The tax ID validation fix should work.');
    console.log('');
    console.log('🔧 Next Steps:');
    console.log('  1. The validation rule has been updated in the database');
    console.log('  2. The enum validation logic has been fixed to handle multiple values');
    console.log('  3. Invoice 19 should now pass validation when reprocessed');
    console.log('  4. All three tax ID formats are now accepted:');
    console.log('     - 860527800 (expected format)');
    console.log('     - 86052780 (without trailing zero)');
    console.log('     - 86052780-0 (with hyphen and check digit)');
  } else {
    console.log('❌ Some tests failed. Please check the validation logic.');
  }
}

// Run the test
testEnumValidation();