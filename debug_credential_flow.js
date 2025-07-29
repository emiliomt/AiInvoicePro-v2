/**
 * Debug script to trace actual credential flow in production
 * This script connects to the database and shows real credential handling
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { erpConnections, invoiceImporterConfigs } from './shared/schema.ts';
import { eq } from 'drizzle-orm';

const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client);

async function debugCredentialFlow() {
  console.log('🔍 Starting production credential flow debugging...\n');
  
  try {
    // 1. Fetch all ERP connections
    console.log('1. Fetching ERP connections:');
    const connections = await db.select().from(erpConnections);
    
    connections.forEach(conn => {
      console.log(`Connection ${conn.id}:`, {
        name: conn.name,
        baseUrl: conn.baseUrl,
        username: conn.username,
        passwordLength: conn.password ? conn.password.length : 0,
        isActive: conn.isActive,
        lastUpdated: conn.updatedAt
      });
      
      // Test password decryption
      if (conn.password) {
        try {
          const decrypted = Buffer.from(conn.password, 'base64').toString('utf8');
          console.log(`  Decrypted password: ${decrypted}`);
        } catch (error) {
          console.log(`  Password decryption error: ${error.message}`);
        }
      }
    });
    
    // 2. Fetch all import configurations
    console.log('\n2. Fetching import configurations:');
    const configs = await db.select().from(invoiceImporterConfigs);
    
    configs.forEach(config => {
      console.log(`Config ${config.id}:`, {
        taskName: config.taskName,
        connectionId: config.connectionId,
        isManualConfig: config.isManualConfig,
        erpUrl: config.erpUrl,
        erpUsername: config.erpUsername,
        erpPasswordLength: config.erpPassword ? config.erpPassword.length : 0,
        isActive: config.isActive,
        isPaused: config.isPaused
      });
      
      // Test password decryption for configs
      if (config.erpPassword) {
        try {
          const decrypted = Buffer.from(config.erpPassword, 'base64').toString('utf8');
          console.log(`  Config decrypted password: ${decrypted}`);
        } catch (error) {
          console.log(`  Config password decryption error: ${error.message}`);
        }
      }
    });
    
    // 3. Analyze credential relationships
    console.log('\n3. Analyzing credential relationships:');
    
    for (const config of configs) {
      console.log(`\nConfig ${config.id} - ${config.taskName}:`);
      
      if (config.isManualConfig || !config.connectionId) {
        console.log('  Type: Manual configuration');
        console.log('  Uses stored credentials:', {
          erpUrl: config.erpUrl,
          erpUsername: config.erpUsername,
          hasPassword: !!config.erpPassword
        });
      } else {
        console.log('  Type: Connection-based configuration');
        console.log(`  References ERP connection ${config.connectionId}`);
        
        // Find the corresponding connection
        const connection = connections.find(c => c.id === config.connectionId);
        if (connection) {
          console.log('  Connection credentials:', {
            baseUrl: connection.baseUrl,
            username: connection.username,
            hasPassword: !!connection.password
          });
          
          // Check if config credentials match connection credentials
          const credsMatch = config.erpUrl === connection.baseUrl &&
                            config.erpUsername === connection.username &&
                            config.erpPassword === connection.password;
          
          console.log(`  Credentials synchronized: ${credsMatch}`);
          
          if (!credsMatch) {
            console.log('  ⚠️  SYNC ISSUE DETECTED!');
            console.log('    Config credentials:', {
              url: config.erpUrl,
              username: config.erpUsername,
              passwordLength: config.erpPassword ? config.erpPassword.length : 0
            });
            console.log('    Connection credentials:', {
              url: connection.baseUrl,
              username: connection.username,
              passwordLength: connection.password ? connection.password.length : 0
            });
          }
        } else {
          console.log('  ❌ Connection not found!');
        }
      }
    }
    
    // 4. Test credential resolution simulation
    console.log('\n4. Testing credential resolution simulation:');
    
    for (const config of configs) {
      console.log(`\nResolving credentials for config ${config.id}:`);
      
      let resolvedConnection;
      
      if (config.isManualConfig || !config.connectionId) {
        // Manual configuration
        resolvedConnection = {
          id: 'manual',
          name: `Manual Config - ${config.taskName}`,
          baseUrl: config.erpUrl,
          username: config.erpUsername,
          password: config.erpPassword,
          isActive: true,
          updatedAt: new Date()
        };
        console.log('  Resolved as manual configuration');
      } else {
        // Connection-based configuration
        const connection = connections.find(c => c.id === config.connectionId);
        if (connection) {
          resolvedConnection = connection;
          console.log('  Resolved from ERP connection');
        } else {
          console.log('  ❌ Failed to resolve connection');
          continue;
        }
      }
      
      // Test password decryption
      if (resolvedConnection.password) {
        try {
          const decrypted = Buffer.from(resolvedConnection.password, 'base64').toString('utf8');
          console.log('  Final credentials:', {
            baseUrl: resolvedConnection.baseUrl,
            username: resolvedConnection.username,
            decryptedPassword: decrypted,
            type: config.isManualConfig ? 'Manual' : 'Connection-based'
          });
        } catch (error) {
          console.log(`  Password decryption failed: ${error.message}`);
        }
      } else {
        console.log('  ❌ No password available');
      }
    }
    
  } catch (error) {
    console.error('Error during credential flow debugging:', error);
  } finally {
    await client.end();
  }
}

// Run the debugging
debugCredentialFlow();