import { UniversalERPAdapter } from './UniversalERPAdapter';
import {
  IntegrationMethod,
  ERPSystem,
  AdapterCapability,
  AdapterMetrics
} from './types';

interface RegisteredAdapter {
  adapterId: string;
  adapter: UniversalERPAdapter;
  capability: AdapterCapability;
  priority: number; // Higher number = higher priority
}

export class ERPAdapterRegistry {
  private adapters: Map<string, RegisteredAdapter> = new Map();
  private adaptersByMethod: Map<IntegrationMethod, RegisteredAdapter[]> = new Map();
  private adaptersByERP: Map<ERPSystem, RegisteredAdapter[]> = new Map();
  
  // Fallback priority order (higher is better)
  private static readonly PRIORITY_ORDER: Record<IntegrationMethod, number> = {
    [IntegrationMethod.API]: 100,
    [IntegrationMethod.XML_POLLING]: 80,
    [IntegrationMethod.EMAIL]: 60,
    [IntegrationMethod.SFTP]: 40,
    [IntegrationMethod.WEB_PORTAL]: 30,
    [IntegrationMethod.RPA]: 10, // Lowest priority - last resort
  };
  
  constructor() {
    // Initialize method maps
    Object.values(IntegrationMethod).forEach(method => {
      this.adaptersByMethod.set(method, []);
    });
    
    // Initialize ERP system maps
    Object.values(ERPSystem).forEach(erp => {
      this.adaptersByERP.set(erp, []);
    });
  }
  
  /**
   * Register a new adapter in the registry
   * Prevents duplicate registrations by checking if adapter ID already exists
   */
  register(adapter: UniversalERPAdapter, capability: AdapterCapability): void {
    const adapterId = adapter.getAdapterId();
    
    // Prevent duplicate registrations
    if (this.adapters.has(adapterId)) {
      console.warn(`[Registry] Adapter ${adapterId} is already registered. Skipping duplicate registration.`);
      return;
    }
    
    const method = adapter.getIntegrationMethod();
    const erpSystem = adapter.getERPSystem() as ERPSystem;
    const priority = ERPAdapterRegistry.PRIORITY_ORDER[method] || 0;
    
    const registered: RegisteredAdapter = {
      adapterId,
      adapter,
      capability,
      priority
    };
    
    // Store in main map
    this.adapters.set(adapterId, registered);
    
    // Store in method-specific map
    const methodAdapters = this.adaptersByMethod.get(method) || [];
    methodAdapters.push(registered);
    methodAdapters.sort((a, b) => b.priority - a.priority);
    this.adaptersByMethod.set(method, methodAdapters);
    
    // Store in ERP-specific map
    const erpAdapters = this.adaptersByERP.get(erpSystem) || [];
    erpAdapters.push(registered);
    erpAdapters.sort((a, b) => b.priority - a.priority);
    this.adaptersByERP.set(erpSystem, erpAdapters);
    
    console.log(`[Registry] Registered adapter: ${adapterId} (${method}, ${erpSystem}, priority: ${priority})`);
  }
  
  /**
   * Unregister an adapter from the registry
   */
  unregister(adapterId: string): boolean {
    const registered = this.adapters.get(adapterId);
    if (!registered) {
      return false;
    }
    
    const method = registered.adapter.getIntegrationMethod();
    const erpSystem = registered.adapter.getERPSystem() as ERPSystem;
    
    // Remove from main map
    this.adapters.delete(adapterId);
    
    // Remove from method-specific map
    const methodAdapters = this.adaptersByMethod.get(method) || [];
    this.adaptersByMethod.set(
      method,
      methodAdapters.filter(a => a.adapterId !== adapterId)
    );
    
    // Remove from ERP-specific map
    const erpAdapters = this.adaptersByERP.get(erpSystem) || [];
    this.adaptersByERP.set(
      erpSystem,
      erpAdapters.filter(a => a.adapterId !== adapterId)
    );
    
    console.log(`[Registry] Unregistered adapter: ${adapterId}`);
    return true;
  }
  
  /**
   * Get an adapter by its ID
   */
  getAdapter(adapterId: string): UniversalERPAdapter | null {
    const registered = this.adapters.get(adapterId);
    return registered ? registered.adapter : null;
  }
  
  /**
   * Get all adapters for a specific integration method
   */
  getAdaptersByMethod(method: IntegrationMethod): UniversalERPAdapter[] {
    const registered = this.adaptersByMethod.get(method) || [];
    return registered.map(r => r.adapter);
  }
  
  /**
   * Get all adapters for a specific ERP system
   */
  getAdaptersByERP(erpSystem: ERPSystem): UniversalERPAdapter[] {
    const registered = this.adaptersByERP.get(erpSystem) || [];
    return registered.map(r => r.adapter);
  }
  
  /**
   * Get the best adapter for a given ERP system and method (optional)
   * Uses health metrics and priority to select the most reliable adapter
   */
  getBestAdapter(
    erpSystem: ERPSystem,
    preferredMethod?: IntegrationMethod
  ): UniversalERPAdapter | null {
    let candidates: RegisteredAdapter[] = [];
    
    if (preferredMethod) {
      // Get adapters that match both ERP and method
      const erpAdapters = this.adaptersByERP.get(erpSystem) || [];
      candidates = erpAdapters.filter(
        a => a.adapter.getIntegrationMethod() === preferredMethod
      );
    } else {
      // Get all adapters for this ERP
      candidates = this.adaptersByERP.get(erpSystem) || [];
    }
    
    if (candidates.length === 0) {
      return null;
    }
    
    // Filter out unhealthy adapters
    const healthyCandidates = candidates.filter(a => a.capability.isHealthy);
    
    // If no healthy adapters, fall back to all candidates
    const finalCandidates = healthyCandidates.length > 0 ? healthyCandidates : candidates;
    
    // Sort by reliability score and priority
    finalCandidates.sort((a, b) => {
      // First compare by health status
      if (a.capability.isHealthy !== b.capability.isHealthy) {
        return a.capability.isHealthy ? -1 : 1;
      }
      // Then by reliability score
      if (a.capability.reliabilityScore !== b.capability.reliabilityScore) {
        return b.capability.reliabilityScore - a.capability.reliabilityScore;
      }
      // Finally by priority
      return b.priority - a.priority;
    });
    
    return finalCandidates[0].adapter;
  }
  
  /**
   * Get adapter capability information
   */
  getCapability(adapterId: string): AdapterCapability | null {
    const registered = this.adapters.get(adapterId);
    return registered ? registered.capability : null;
  }
  
  /**
   * Update adapter capability (e.g., after health check)
   */
  updateCapability(adapterId: string, capability: Partial<AdapterCapability>): boolean {
    const registered = this.adapters.get(adapterId);
    if (!registered) {
      return false;
    }
    
    registered.capability = {
      ...registered.capability,
      ...capability,
      lastHealthCheck: new Date()
    };
    
    return true;
  }
  
  /**
   * Get metrics for an adapter
   */
  getMetrics(adapterId: string): AdapterMetrics | null {
    const adapter = this.getAdapter(adapterId);
    return adapter ? adapter.getMetrics() : null;
  }
  
  /**
   * List all registered adapters
   */
  listAdapters(): Array<{
    adapterId: string;
    method: IntegrationMethod;
    erpSystem: string;
    priority: number;
    capability: AdapterCapability;
    metrics: AdapterMetrics;
  }> {
    return Array.from(this.adapters.values()).map(registered => ({
      adapterId: registered.adapterId,
      method: registered.adapter.getIntegrationMethod(),
      erpSystem: registered.adapter.getERPSystem(),
      priority: registered.priority,
      capability: registered.capability,
      metrics: registered.adapter.getMetrics()
    }));
  }
  
  /**
   * Perform health checks on all registered adapters
   */
  async performHealthChecks(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    
    for (const [adapterId, registered] of Array.from(this.adapters.entries())) {
      try {
        const testResult = await registered.adapter.testConnection();
        const isHealthy = testResult.success;
        
        // Update capability
        this.updateCapability(adapterId, {
          isHealthy,
          lastHealthCheck: new Date(),
          averageResponseTime: testResult.responseTime,
          reliabilityScore: isHealthy ? 
            Math.min(100, registered.capability.reliabilityScore + 5) : 
            Math.max(0, registered.capability.reliabilityScore - 10)
        });
        
        results.set(adapterId, isHealthy);
      } catch (error: any) {
        console.error(`[Registry] Health check failed for ${adapterId}:`, error.message);
        
        // Mark as unhealthy
        this.updateCapability(adapterId, {
          isHealthy: false,
          lastHealthCheck: new Date(),
          reliabilityScore: Math.max(0, registered.capability.reliabilityScore - 20)
        });
        
        results.set(adapterId, false);
      }
    }
    
    return results;
  }
  
  /**
   * Get adapter count
   */
  count(): number {
    return this.adapters.size;
  }
  
  /**
   * Clear all adapters from the registry
   */
  clear(): void {
    this.adapters.clear();
    this.adaptersByMethod.forEach((_, method) => {
      this.adaptersByMethod.set(method, []);
    });
    this.adaptersByERP.forEach((_, erp) => {
      this.adaptersByERP.set(erp, []);
    });
    console.log('[Registry] Cleared all adapters');
  }
}

// Singleton instance
export const adapterRegistry = new ERPAdapterRegistry();
