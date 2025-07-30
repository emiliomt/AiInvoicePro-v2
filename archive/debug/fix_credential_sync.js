/**
 * Fix credential synchronization for existing import configurations
 * This script will sync all connection-based import configs with their ERP connections
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { erpConnections, invoiceImporterConfigs } from './shared/schema.ts';
import { eq } from 'drizzle-orm';

const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client);

async function fixCredentialSync() {
  console.log('🔧 Starting credential synchronization fix...\n');
  
  try {
    // 1. Get all ERP connections
    const connections = await db.select().from(erpConnections);
    console.log(`Found ${connections.length} ERP connections`);
    
    // 2. Get all connection-based import configurations
    const configs = await db.select()
      .from(invoiceImporterConfigs)
      .where(eq(invoiceImporterConfigs.isManualConfig, false));
    
    console.log(`Found ${configs.length} connection-based import configurations`);
    
    // 3. Fix synchronization for each configuration
    let fixedCount = 0;
    
    for (const config of configs) {
      if (!config.connectionId) {
        console.log(`Skipping config ${config.id} - no connection ID`);
        continue;
      }
      
      const connection = connections.find(c => c.id === config.connectionId);
      if (!connection) {
        console.log(`❌ Config ${config.id} references non-existent connection ${config.connectionId}`);
        continue;
      }
      
      // Check if credentials are out of sync
      const needsSync = config.erpUrl !== connection.baseUrl ||
                       config.erpUsername !== connection.username ||
                       config.erpPassword !== connection.password;
                       
      if (needsSync) {
        console.log(`🔄 Syncing config ${config.id} (${config.taskName}) with connection ${connection.id}`);
        
        // Show what's being updated
        console.log('  Before:', {
          url: config.erpUrl,
          username: config.erpUsername,
          passwordLength: config.erpPassword ? config.erpPassword.length : 0,
          password_decoded: config.erpPassword ? Buffer.from(config.erpPassword, 'base64').toString('utf8') : 'none'
        });
        
        console.log('  After:', {
          url: connection.baseUrl,
          username: connection.username,
          passwordLength: connection.password ? connection.password.length : 0,
          password_decoded: connection.password ? Buffer.from(connection.password, 'base64').toString('utf8') : 'none'
        });
        
        // Update the configuration
        await db.update(invoiceImporterConfigs)
          .set({
            erpUrl: connection.baseUrl,
            erpUsername: connection.username,
            erpPassword: connection.password,
            updatedAt: new Date()
          })
          .where(eq(invoiceImporterConfigs.id, config.id));
          
        fixedCount++;
        console.log(`  ✅ Config ${config.id} synchronized`);
      } else {
        console.log(`✅ Config ${config.id} (${config.taskName}) already synchronized`);
      }
    }
    
    console.log(`\n🎉 Synchronization complete!`);
    console.log(`Fixed ${fixedCount} out of ${configs.length} configurations`);
    
    // 4. Verify the fixes
    console.log('\n🔍 Verifying fixes...');
    const updatedConfigs = await db.select()
      .from(invoiceImporterConfigs)
      .where(eq(invoiceImporterConfigs.isManualConfig, false));
      
    let verifiedCount = 0;
    for (const config of updatedConfigs) {
      if (!config.connectionId) continue;
      
      const connection = connections.find(c => c.id === config.connectionId);
      if (!connection) continue;
      
      const isSync = config.erpUrl === connection.baseUrl &&
                    config.erpUsername === connection.username &&
                    config.erpPassword === connection.password;
                    
      if (isSync) {
        verifiedCount++;
      } else {
        console.log(`❌ Config ${config.id} still out of sync!`);
      }
    }
    
    console.log(`✅ Verified ${verifiedCount} configurations are now synchronized`);
    
  } catch (error) {
    console.error('Error during credential sync fix:', error);
  } finally {
    await client.end();
  }
}

// Run the fix
fixCredentialSync();