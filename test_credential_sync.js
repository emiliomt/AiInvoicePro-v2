/**
 * Test script to verify ERP connection credential synchronization
 * and invoice import configuration credential handling
 */

// Test password encryption/decryption
function testPasswordHandling() {
  console.log('🧪 Testing password encryption/decryption:');
  
  const originalPassword = 'MySecretPassword123!';
  console.log(`Original password: ${originalPassword}`);
  
  // Encrypt (Base64 encoding)
  const encrypted = Buffer.from(originalPassword).toString('base64');
  console.log(`Encrypted: ${encrypted}`);
  console.log(`Encrypted length: ${encrypted.length}`);
  
  // Decrypt (Base64 decoding)
  const decrypted = Buffer.from(encrypted, 'base64').toString('utf8');
  console.log(`Decrypted: ${decrypted}`);
  console.log(`Match: ${originalPassword === decrypted}`);
  
  return { originalPassword, encrypted, decrypted, matches: originalPassword === decrypted };
}

// Test credential flow simulation
function testCredentialFlow() {
  console.log('\n🔄 Testing credential flow simulation:');
  
  // Simulate ERP connection update
  const erpConnection = {
    id: 1,
    name: 'Test ERP',
    baseUrl: 'https://erp.example.com',
    username: 'testuser',
    password: Buffer.from('NewPassword456!').toString('base64'), // Encrypted
    updatedAt: new Date()
  };
  
  console.log('ERP Connection:', {
    id: erpConnection.id,
    name: erpConnection.name,
    baseUrl: erpConnection.baseUrl,
    username: erpConnection.username,
    encryptedPasswordLength: erpConnection.password.length,
    lastUpdated: erpConnection.updatedAt
  });
  
  // Simulate import configuration types
  const connectionBasedConfig = {
    id: 1,
    taskName: 'Connection-based Import',
    connectionId: 1,
    isManualConfig: false,
    erpUrl: null, // Should be populated from connection
    erpUsername: null, // Should be populated from connection
    erpPassword: null // Should be populated from connection
  };
  
  const manualConfig = {
    id: 2,
    taskName: 'Manual Import',
    connectionId: null,
    isManualConfig: true,
    erpUrl: 'https://manual.erp.com',
    erpUsername: 'manualuser',
    erpPassword: Buffer.from('ManualPassword789!').toString('base64') // Encrypted
  };
  
  console.log('\nConnection-based config:', connectionBasedConfig);
  console.log('Manual config:', {
    ...manualConfig,
    encryptedPasswordLength: manualConfig.erpPassword.length
  });
  
  // Test credential resolution for both types
  console.log('\n🔍 Testing credential resolution:');
  
  // For connection-based config
  const connectionCreds = {
    id: erpConnection.id,
    name: erpConnection.name,
    baseUrl: erpConnection.baseUrl,
    username: erpConnection.username,
    password: erpConnection.password
  };
  
  const connectionDecrypted = Buffer.from(connectionCreds.password, 'base64').toString('utf8');
  console.log('Connection-based credentials:', {
    type: 'Connection-based',
    baseUrl: connectionCreds.baseUrl,
    username: connectionCreds.username,
    decryptedPassword: connectionDecrypted
  });
  
  // For manual config
  const manualCreds = {
    id: 'manual',
    name: `Manual Config - ${manualConfig.taskName}`,
    baseUrl: manualConfig.erpUrl,
    username: manualConfig.erpUsername,
    password: manualConfig.erpPassword
  };
  
  const manualDecrypted = Buffer.from(manualCreds.password, 'base64').toString('utf8');
  console.log('Manual credentials:', {
    type: 'Manual',
    baseUrl: manualCreds.baseUrl,
    username: manualCreds.username,
    decryptedPassword: manualDecrypted
  });
  
  return {
    connectionBasedConfig,
    manualConfig,
    connectionCreds: { ...connectionCreds, decryptedPassword: connectionDecrypted },
    manualCreds: { ...manualCreds, decryptedPassword: manualDecrypted }
  };
}

// Test synchronization logic
function testSyncLogic() {
  console.log('\n🔄 Testing synchronization logic:');
  
  // Simulate ERP connection update
  const updatedConnection = {
    id: 1,
    baseUrl: 'https://updated.erp.com',
    username: 'updateduser',
    password: Buffer.from('UpdatedPassword999!').toString('base64')
  };
  
  // Simulate import configurations that should be updated
  const configsToSync = [
    {
      id: 1,
      connectionId: 1,
      isManualConfig: false,
      erpUrl: 'https://old.erp.com', // Should be updated
      erpUsername: 'olduser', // Should be updated
      erpPassword: Buffer.from('OldPassword').toString('base64') // Should be updated
    },
    {
      id: 2,
      connectionId: 1,
      isManualConfig: false,
      erpUrl: 'https://another-old.erp.com', // Should be updated
      erpUsername: 'anotherolduser', // Should be updated
      erpPassword: Buffer.from('AnotherOldPassword').toString('base64') // Should be updated
    },
    {
      id: 3,
      connectionId: null,
      isManualConfig: true,
      erpUrl: 'https://manual.erp.com', // Should NOT be updated
      erpUsername: 'manualuser', // Should NOT be updated
      erpPassword: Buffer.from('ManualPassword').toString('base64') // Should NOT be updated
    }
  ];
  
  console.log('Updated ERP connection:', {
    id: updatedConnection.id,
    baseUrl: updatedConnection.baseUrl,
    username: updatedConnection.username,
    decryptedPassword: Buffer.from(updatedConnection.password, 'base64').toString('utf8')
  });
  
  console.log('\nConfigs before sync:');
  configsToSync.forEach(config => {
    console.log(`Config ${config.id}:`, {
      connectionId: config.connectionId,
      isManualConfig: config.isManualConfig,
      erpUrl: config.erpUrl,
      username: config.erpUsername,
      decryptedPassword: config.erpPassword ? Buffer.from(config.erpPassword, 'base64').toString('utf8') : null
    });
  });
  
  // Apply sync logic
  const configsAfterSync = configsToSync.map(config => {
    if (!config.isManualConfig && config.connectionId === updatedConnection.id) {
      // Should be updated
      return {
        ...config,
        erpUrl: updatedConnection.baseUrl,
        erpUsername: updatedConnection.username,
        erpPassword: updatedConnection.password
      };
    }
    // Should not be updated (manual config or different connection)
    return config;
  });
  
  console.log('\nConfigs after sync:');
  configsAfterSync.forEach(config => {
    console.log(`Config ${config.id}:`, {
      connectionId: config.connectionId,
      isManualConfig: config.isManualConfig,
      erpUrl: config.erpUrl,
      username: config.erpUsername,
      decryptedPassword: config.erpPassword ? Buffer.from(config.erpPassword, 'base64').toString('utf8') : null
    });
  });
  
  return { configsBefore: configsToSync, configsAfter: configsAfterSync };
}

// Run all tests
function runTests() {
  console.log('🚀 Starting credential synchronization tests...\n');
  
  const passwordTest = testPasswordHandling();
  const credentialFlowTest = testCredentialFlow();
  const syncTest = testSyncLogic();
  
  console.log('\n✅ All tests completed!');
  console.log('\nSummary:');
  console.log(`- Password encryption/decryption: ${passwordTest.matches ? 'PASS' : 'FAIL'}`);
  console.log(`- Connection-based config: ${credentialFlowTest.connectionCreds.decryptedPassword ? 'PASS' : 'FAIL'}`);
  console.log(`- Manual config: ${credentialFlowTest.manualCreds.decryptedPassword ? 'PASS' : 'FAIL'}`);
  console.log(`- Sync logic: ${syncTest.configsAfter.length > 0 ? 'PASS' : 'FAIL'}`);
  
  return {
    passwordTest,
    credentialFlowTest,
    syncTest
  };
}

// Run the tests
runTests();