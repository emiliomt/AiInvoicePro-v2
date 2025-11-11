/**
 * ERP Adapter Service
 * Centralized singleton for managing ERP adapters across the application
 */

import { ERPAdapterRegistry } from './ERPAdapterRegistry';
import { RPAFallbackAdapter } from './adapters/RPAFallbackAdapter';
import { GenericAPIAdapter } from './adapters/GenericAPIAdapter';
import { SINCOAPIAdapter } from './adapters/SINCOAPIAdapter';
import { XMLPollingAdapter } from './adapters/XMLPollingAdapter';
import { EmailPollingAdapter } from './adapters/EmailPollingAdapter';
import { SFTPAdapter } from './adapters/SFTPAdapter';
import { PythonRPAService } from '../pythonRpaService';
import { IntegrationMethod, ERPSystem } from './types';

// Create a singleton registry instance
export const adapterRegistry = new ERPAdapterRegistry();

// Track initialization state to prevent duplicate registrations
let isInitialized = false;

/**
 * Initialize and register all available adapters
 * This MUST be called once during application startup and MUST be awaited
 * @throws Error if initialization fails
 */
export async function initializeAdapters(): Promise<void> {
  // Guard against duplicate initialization
  if (isInitialized) {
    console.log('[AdapterService] Adapters already initialized, skipping...');
    return;
  }
  
  console.log('[AdapterService] Initializing ERP adapters...');
  
  try {
    // Register RPA Fallback Adapter (legacy support)
    // This ensures backward compatibility with existing Python RPA system
    const rpaAdapter = new RPAFallbackAdapter(
      'rpa-fallback-legacy',
      {
        method: IntegrationMethod.RPA,
        erpSystem: ERPSystem.SINCO,
        headless: true,
        zipDownloadTimeout: 300
      }
    );
    
    adapterRegistry.register(rpaAdapter, {
      method: IntegrationMethod.RPA,
      erpSystem: ERPSystem.SINCO,
      supportedFeatures: ['bulkDownload', 'xmlSupport', 'pdfSupport'],
      reliabilityScore: 70,
      averageResponseTime: 15000,
      isHealthy: true
    });
    
    console.log('[AdapterService] ✓ Registered RPA Fallback Adapter');
    
    // Register SINCO API Adapter (when API becomes available)
    // Currently stub - will be implemented when API documentation is available
    const sincoAPIAdapter = new SINCOAPIAdapter(
      'sinco-api-v1',
      {
        method: IntegrationMethod.API,
        erpSystem: ERPSystem.SINCO,
        baseUrl: process.env.SINCO_API_BASE_URL || 'https://api.sinco.co'
      }
    );
    
    adapterRegistry.register(sincoAPIAdapter, {
      method: IntegrationMethod.API,
      erpSystem: ERPSystem.SINCO,
      supportedFeatures: ['realTimeSync', 'webhookSupport', 'bulkDownload', 'xmlSupport', 'pdfSupport'],
      reliabilityScore: 0, // Set to 0 until API is available
      averageResponseTime: 0,
      isHealthy: false // Will be set to true once API is available
    });
    
    console.log('[AdapterService] ✓ Registered SINCO API Adapter (stub - disabled)');
    
    // Register Generic API Adapter (for future ERP systems with REST APIs)
    const genericAPIAdapter = new GenericAPIAdapter(
      'generic-api',
      {
        method: IntegrationMethod.API,
        erpSystem: ERPSystem.GENERIC,
        baseUrl: process.env.GENERIC_ERP_API_URL || 'http://localhost:8080'
      }
    );
    
    adapterRegistry.register(genericAPIAdapter, {
      method: IntegrationMethod.API,
      erpSystem: ERPSystem.GENERIC,
      supportedFeatures: ['bulkDownload', 'xmlSupport'],
      reliabilityScore: 0, // Set to 0 until configured
      averageResponseTime: 0,
      isHealthy: false // Will be enabled when configured
    });
    
    console.log('[AdapterService] ✓ Registered Generic API Adapter (stub - disabled)');
    
    // Register XML Polling Adapter (for systems that export XML files to a directory)
    const xmlPollingAdapter = new XMLPollingAdapter(
      'xml-polling',
      {
        method: IntegrationMethod.XML_POLLING,
        erpSystem: ERPSystem.GENERIC,
        xmlPath: process.env.XML_POLL_PATH || './xml_imports',
        pollInterval: 5
      }
    );
    
    adapterRegistry.register(xmlPollingAdapter, {
      method: IntegrationMethod.XML_POLLING,
      erpSystem: ERPSystem.GENERIC,
      supportedFeatures: ['bulkDownload', 'xmlSupport'],
      reliabilityScore: 0, // Set to 0 until configured
      averageResponseTime: 0,
      isHealthy: false // Will be enabled when configured
    });
    
    console.log('[AdapterService] ✓ Registered XML Polling Adapter (stub - disabled)');
    
    // Register Email Polling Adapter (only if configured)
    // Requires: EMAIL_HOST, EMAIL_ADDRESS, EMAIL_PASSWORD
    if (process.env.EMAIL_HOST && process.env.EMAIL_ADDRESS && process.env.EMAIL_PASSWORD) {
      const emailAdapter = new EmailPollingAdapter(
        'email-polling',
        {
          method: IntegrationMethod.EMAIL,
          erpSystem: ERPSystem.GENERIC,
          host: process.env.EMAIL_HOST,
          port: parseInt(process.env.EMAIL_PORT || '993'),
          email: process.env.EMAIL_ADDRESS,
          password: process.env.EMAIL_PASSWORD,
          pollInterval: 15
        }
      );
      
      adapterRegistry.register(emailAdapter, {
        method: IntegrationMethod.EMAIL,
        erpSystem: ERPSystem.GENERIC,
        supportedFeatures: ['xmlSupport', 'pdfSupport'],
        reliabilityScore: 0, // Set to 0 until configured
        averageResponseTime: 0,
        isHealthy: false
      });
      
      console.log('[AdapterService] ✓ Registered Email Polling Adapter (stub - disabled)');
    } else {
      console.log('[AdapterService] ⊘ Skipped Email Polling Adapter (missing env: EMAIL_HOST, EMAIL_ADDRESS, EMAIL_PASSWORD)');
    }
    
    // Register SFTP Adapter (only if configured)
    // Requires: SFTP_HOST, SFTP_USERNAME, SFTP_PASSWORD
    if (process.env.SFTP_HOST && process.env.SFTP_USERNAME && process.env.SFTP_PASSWORD) {
      const sftpAdapter = new SFTPAdapter(
        'sftp-adapter',
        {
          method: IntegrationMethod.SFTP,
          erpSystem: ERPSystem.GENERIC,
          host: process.env.SFTP_HOST,
          port: parseInt(process.env.SFTP_PORT || '22'),
          username: process.env.SFTP_USERNAME,
          password: process.env.SFTP_PASSWORD,
          ftpPath: '/invoices'
        }
      );
      
      adapterRegistry.register(sftpAdapter, {
        method: IntegrationMethod.SFTP,
        erpSystem: ERPSystem.GENERIC,
        supportedFeatures: ['bulkDownload', 'xmlSupport', 'pdfSupport'],
        reliabilityScore: 0, // Set to 0 until configured
        averageResponseTime: 0,
        isHealthy: false
      });
      
      console.log('[AdapterService] ✓ Registered SFTP Adapter (stub - disabled)');
    } else {
      console.log('[AdapterService] ⊘ Skipped SFTP Adapter (missing env: SFTP_HOST, SFTP_USERNAME, SFTP_PASSWORD)');
    }
    
    const count = adapterRegistry.count();
    const healthyCount = adapterRegistry.listAdapters().filter(a => a.capability.isHealthy).length;
    
    // Mark as initialized only after ALL adapters successfully registered
    isInitialized = true;
    
    console.log(`[AdapterService] ✅ Successfully initialized ${count} adapters (${healthyCount} healthy)`);
    console.log('[AdapterService] Adapter priority order: API (100) > XML (80) > Email (60) > SFTP (40) > RPA (10)');
    console.log('[AdapterService] Note: Stub adapters are registered but disabled until configured');
    
  } catch (error: any) {
    isInitialized = false;
    console.error('[AdapterService] ❌ Error initializing adapters:', error.message);
    throw new Error(`Failed to initialize ERP adapters: ${error.message}`);
  }
}

/**
 * Check if adapters have been initialized
 */
export function isAdaptersInitialized(): boolean {
  return isInitialized;
}

/**
 * Get the best adapter for a specific ERP system and integration method
 */
export function getBestAdapter(erpSystem: string, method?: IntegrationMethod) {
  return adapterRegistry.getBestAdapter(erpSystem as any, method);
}

/**
 * Test all adapters and return health status
 */
export async function performHealthChecks() {
  console.log('[AdapterService] Performing health checks on all adapters...');
  const results = await adapterRegistry.performHealthChecks();
  
  let healthyCount = 0;
  let unhealthyCount = 0;
  
  for (const [adapterId, isHealthy] of Array.from(results.entries())) {
    if (isHealthy) {
      healthyCount++;
      console.log(`[AdapterService] ✓ ${adapterId}: healthy`);
    } else {
      unhealthyCount++;
      console.log(`[AdapterService] ✗ ${adapterId}: unhealthy`);
    }
  }
  
  console.log(`[AdapterService] Health check complete: ${healthyCount} healthy, ${unhealthyCount} unhealthy`);
  return results;
}

/**
 * Get adapter statistics
 */
export function getAdapterStats() {
  const adapters = adapterRegistry.listAdapters();
  
  const stats = {
    total: adapters.length,
    healthy: adapters.filter(a => a.capability.isHealthy).length,
    unhealthy: adapters.filter(a => !a.capability.isHealthy).length,
    byMethod: {} as Record<string, number>,
    byErpSystem: {} as Record<string, number>,
    avgReliability: 0,
    avgResponseTime: 0
  };
  
  let totalReliability = 0;
  let totalResponseTime = 0;
  
  for (const adapter of adapters) {
    // Count by method
    const method = adapter.method;
    stats.byMethod[method] = (stats.byMethod[method] || 0) + 1;
    
    // Count by ERP system
    const erpSystem = adapter.erpSystem;
    stats.byErpSystem[erpSystem] = (stats.byErpSystem[erpSystem] || 0) + 1;
    
    // Sum for averages
    totalReliability += adapter.capability.reliabilityScore;
    totalResponseTime += adapter.capability.averageResponseTime;
  }
  
  if (adapters.length > 0) {
    stats.avgReliability = Math.round(totalReliability / adapters.length);
    stats.avgResponseTime = Math.round(totalResponseTime / adapters.length);
  }
  
  return stats;
}
