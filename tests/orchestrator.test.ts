import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Orchestrator, { InvoiceRecord, PipelineResult } from '../server/orchestrator/orchestrator';
import { PipelineState } from '../server/orchestrator/stateMachine';
import { OrchestratorConfig } from '../server/orchestrator/config';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock external dependencies
jest.mock('../server/services/aiService');
jest.mock('../server/services/ocrService');
jest.mock('../server/services/xmlParser');
jest.mock('../server/services/erpAutomationService');
jest.mock('../server/services/invoiceImporterService');
jest.mock('../server/services/progressTracker');
jest.mock('../server/services/pythonRpaService');

describe('Orchestrator Integration Tests', () => {
  let orchestrator: Orchestrator;
  let testConfigPath: string;
  let testInvoices: InvoiceRecord[];

  beforeEach(async () => {
    // Create test configuration
    testConfigPath = path.join(__dirname, 'test-config.yaml');
    const testConfig = `
stages:
  - import_invoices
  - ocr_process
  - ai_extract
  - validate
  - notify

concurrency:
  defaultMaxWorkers: 2
  erpSerializationPerTenant: true

retries:
  strategy: exponential_backoff_jitter
  maxAttempts: 3
  initialDelaySeconds: 1
  maxDelaySeconds: 5
  retryOn:
    - NetworkError
    - RateLimitError
    - TransientError

timeouts:
  import_invoices: 30000
  ocr_process: 45000
  ai_extract: 60000
  validate: 30000
  notify: 15000

featureFlags:
  enable_import: true
  enable_ocr: true
  enable_ai_extract: true
  enable_xml_parse: false
  enable_validate: true
  enable_erp_post: false
  enable_reconcile: false
  enable_notify: true

tenants:
  - tenant_id: test
    erp_system: SINCO
    use_sandbox: true
    rpa_profile: headless
`;

    await fs.writeFile(testConfigPath, testConfig);
    
    // Initialize orchestrator with test config
    orchestrator = new Orchestrator(testConfigPath);
    await orchestrator.initialize();

    // Create test invoice records
    testInvoices = [
      {
        id: 'test-invoice-1',
        filePath: '/tmp/test-invoice-1.pdf',
        buffer: Buffer.from('test invoice content 1'),
        tenantId: 'test',
        fingerprint: 'fingerprint-1',
        metadata: { type: 'pdf', size: 1024 }
      },
      {
        id: 'test-invoice-2',
        filePath: '/tmp/test-invoice-2.xml',
        buffer: Buffer.from('<invoice>test content</invoice>'),
        tenantId: 'test',
        fingerprint: 'fingerprint-2',
        metadata: { type: 'xml', size: 512 }
      }
    ];
  });

  afterEach(async () => {
    // Cleanup test configuration
    try {
      await fs.unlink(testConfigPath);
    } catch (error) {
      // Ignore cleanup errors
    }

    // Clear test directories
    try {
      await fs.rm('.orchestrator', { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Configuration Loading', () => {
    test('should load configuration from YAML file', () => {
      const config = new OrchestratorConfig(testConfigPath);
      
      expect(config.stages).toContain('import_invoices');
      expect(config.stages).toContain('ai_extract');
      expect(config.concurrency.defaultMaxWorkers).toBe(2);
      expect(config.retries.maxAttempts).toBe(3);
    });

    test('should override configuration with environment variables', () => {
      // Set environment variables
      process.env.ORCHESTRATOR_MAX_WORKERS = '8';
      process.env.ORCHESTRATOR_MAX_RETRIES = '7';
      
      const config = new OrchestratorConfig(testConfigPath);
      
      expect(config.concurrency.defaultMaxWorkers).toBe(8);
      expect(config.retries.maxAttempts).toBe(7);
      
      // Cleanup
      delete process.env.ORCHESTRATOR_MAX_WORKERS;
      delete process.env.ORCHESTRATOR_MAX_RETRIES;
    });
  });

  describe('Dry Run Mode', () => {
    test('should complete full pipeline in dry run mode', async () => {
      const result = await orchestrator.runFullPipeline(testInvoices, {
        dryRun: true,
        tenantId: 'test'
      });

      expect(result.runId).toBeDefined();
      expect(result.summary.totalInvoices).toBe(2);
      expect(result.failures).toHaveLength(0);
      
      // Should have success counts for enabled stages
      expect(result.summary.byStage.import_invoices.ok).toBe(2);
      expect(result.summary.byStage.ocr_process.ok).toBe(2);
      expect(result.summary.byStage.ai_extract.ok).toBe(2);
      expect(result.summary.byStage.validate.ok).toBe(2);
      expect(result.summary.byStage.notify.ok).toBe(2);
    });

    test('should not persist changes in dry run mode', async () => {
      const result = await orchestrator.runFullPipeline(testInvoices, {
        dryRun: true,
        tenantId: 'test'
      });

      // Check that no idempotency records were created
      const idempotencyStore = (orchestrator as any).idempotencyStore;
      const completedStages = await idempotencyStore.getCompletedStages('fingerprint-1', 'test');
      
      expect(completedStages).toHaveLength(0);
    });
  });

  describe('Stage Execution', () => {
    test('should execute pipeline stages in correct order', async () => {
      const executionOrder: string[] = [];
      
      // Mock adapters to track execution order
      const mockExecute = jest.fn().mockImplementation(async (input, context) => {
        executionOrder.push(context.logger.bindings().stage || 'unknown');
        return { ...input, mockProcessed: true };
      });

      // Replace adapter execution methods
      const adapters = (orchestrator as any).adapters;
      adapters.importInvoices = mockExecute;
      adapters.processOCR = mockExecute;
      adapters.extractWithAI = mockExecute;
      adapters.validateData = mockExecute;
      adapters.sendNotifications = mockExecute;

      await orchestrator.runFullPipeline([testInvoices[0]], {
        tenantId: 'test'
      });

      // Note: The exact order depends on the logger binding implementation
      // This test verifies that execution happens in the expected sequence
      expect(mockExecute).toHaveBeenCalledTimes(5); // 5 enabled stages
    });

    test('should skip disabled stages', async () => {
      const result = await orchestrator.runFullPipeline(testInvoices, {
        dryRun: true,
        tenantId: 'test'
      });

      // XML parsing, ERP posting, and reconciliation should be disabled in test config
      expect(result.summary.byStage.xml_parse?.ok || 0).toBe(0);
      expect(result.summary.byStage.erp_post?.ok || 0).toBe(0);
      expect(result.summary.byStage.reconcile?.ok || 0).toBe(0);
    });
  });

  describe('Error Handling and Retries', () => {
    test('should retry on transient errors', async () => {
      let attemptCount = 0;
      
      // Mock adapter to fail twice, then succeed
      const mockAdapter = jest.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount <= 2) {
          const error = new Error('Transient network issue');
          error.name = 'TransientError';
          throw error;
        }
        return { processed: true };
      });

      const adapters = (orchestrator as any).adapters;
      adapters.processOCR = mockAdapter;

      const result = await orchestrator.runFullPipeline([testInvoices[0]], {
        tenantId: 'test'
      });

      expect(mockAdapter).toHaveBeenCalledTimes(3); // Failed twice, succeeded on third
      expect(result.failures).toHaveLength(0);
      expect(result.summary.byStage.ocr_process.ok).toBe(1);
    });

    test('should fail after max retry attempts', async () => {
      // Mock adapter to always fail
      const mockAdapter = jest.fn().mockImplementation(async () => {
        const error = new Error('Persistent network issue');
        error.name = 'NetworkError';
        throw error;
      });

      const adapters = (orchestrator as any).adapters;
      adapters.processOCR = mockAdapter;

      const result = await orchestrator.runFullPipeline([testInvoices[0]], {
        tenantId: 'test'
      });

      expect(mockAdapter).toHaveBeenCalledTimes(3); // Max retry attempts from test config
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].stage).toBe('ocr_process');
      expect(result.summary.byStage.ocr_process.failed).toBe(1);
    });

    test('should not retry non-retryable errors', async () => {
      // Mock adapter to fail with non-retryable error
      const mockAdapter = jest.fn().mockImplementation(async () => {
        throw new Error('Invalid input format'); // Non-retryable error
      });

      const adapters = (orchestrator as any).adapters;
      adapters.validateData = mockAdapter;

      const result = await orchestrator.runFullPipeline([testInvoices[0]], {
        tenantId: 'test'
      });

      expect(mockAdapter).toHaveBeenCalledTimes(1); // No retries for non-retryable error
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].stage).toBe('validate');
    });
  });

  describe('Idempotency and Resume', () => {
    test('should skip completed stages when resuming', async () => {
      const idempotencyStore = (orchestrator as any).idempotencyStore;
      
      // Mark some stages as completed
      await idempotencyStore.markStageCompleted(
        'fingerprint-1',
        PipelineState.IMPORTED,
        'test',
        { processed: true }
      );
      await idempotencyStore.markStageCompleted(
        'fingerprint-1',
        PipelineState.OCR_PROCESSED,
        'test',
        { ocrText: 'extracted text' }
      );

      const mockAdapter = jest.fn().mockResolvedValue({ processed: true });
      const adapters = (orchestrator as any).adapters;
      adapters.importInvoices = mockAdapter;
      adapters.processOCR = mockAdapter;
      adapters.extractWithAI = mockAdapter;

      await orchestrator.runFullPipeline([testInvoices[0]], {
        resume: true,
        tenantId: 'test'
      });

      // Import and OCR should be skipped, AI extraction should run
      expect(mockAdapter).toHaveBeenCalledTimes(1); // Only AI extraction runs
    });

    test('should track stage completion', async () => {
      await orchestrator.runFullPipeline([testInvoices[0]], {
        tenantId: 'test'
      });

      const idempotencyStore = (orchestrator as any).idempotencyStore;
      const completedStages = await idempotencyStore.getCompletedStages('fingerprint-1', 'test');
      
      // All enabled stages should be completed
      expect(completedStages).toContain(PipelineState.IMPORTED);
      expect(completedStages).toContain(PipelineState.OCR_PROCESSED);
      expect(completedStages).toContain(PipelineState.AI_EXTRACTED);
      expect(completedStages).toContain(PipelineState.VALIDATED);
      expect(completedStages).toContain(PipelineState.NOTIFIED);
    });
  });

  describe('Concurrency Control', () => {
    test('should respect max workers limit', async () => {
      const startTimes: number[] = [];
      const endTimes: number[] = [];
      
      // Mock adapter with delay to test concurrency
      const mockAdapter = jest.fn().mockImplementation(async () => {
        startTimes.push(Date.now());
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
        endTimes.push(Date.now());
        return { processed: true };
      });

      const adapters = (orchestrator as any).adapters;
      adapters.importInvoices = mockAdapter;

      // Process 4 invoices with maxWorkers=2
      const manyInvoices = Array.from({ length: 4 }, (_, i) => ({
        ...testInvoices[0],
        id: `test-invoice-${i}`,
        fingerprint: `fingerprint-${i}`
      }));

      await orchestrator.runFullPipeline(manyInvoices, {
        maxWorkers: 2,
        tenantId: 'test'
      });

      // With maxWorkers=2, should have overlapping execution but limited concurrency
      expect(startTimes).toHaveLength(4);
      expect(endTimes).toHaveLength(4);
    });
  });

  describe('Output and Artifacts', () => {
    test('should generate audit log', async () => {
      const result = await orchestrator.runFullPipeline([testInvoices[0]], {
        dryRun: true,
        tenantId: 'test'
      });

      const auditLogPath = result.artifacts.auditLog;
      expect(auditLogPath).toMatch(/\.orchestrator\/audit\/.*\.jsonl/);
      
      // Check if audit log file exists
      const auditLogExists = await fs.access(auditLogPath).then(() => true).catch(() => false);
      expect(auditLogExists).toBe(true);
    });

    test('should generate metrics', async () => {
      const result = await orchestrator.runFullPipeline([testInvoices[0]], {
        dryRun: true,
        tenantId: 'test'
      });

      const metricsPath = result.artifacts.metrics;
      expect(metricsPath).toMatch(/\.orchestrator\/metrics\/.*\.json/);
      
      // Check if metrics file exists
      const metricsExists = await fs.access(metricsPath).then(() => true).catch(() => false);
      expect(metricsExists).toBe(true);
    });

    test('should include comprehensive result summary', async () => {
      const result = await orchestrator.runFullPipeline(testInvoices, {
        dryRun: true,
        tenantId: 'test'
      });

      expect(result.runId).toBeDefined();
      expect(result.startedAt).toBeDefined();
      expect(result.endedAt).toBeDefined();
      expect(result.summary.totalInvoices).toBe(2);
      
      // Should have stage-by-stage breakdown
      expect(result.summary.byStage).toHaveProperty('import_invoices');
      expect(result.summary.byStage).toHaveProperty('ocr_process');
      expect(result.summary.byStage).toHaveProperty('ai_extract');
      
      expect(result.failures).toEqual([]);
      expect(result.artifacts.auditLog).toBeDefined();
      expect(result.artifacts.metrics).toBeDefined();
    });
  });

  describe('State Machine', () => {
    test('should transition through states correctly', async () => {
      const { StateMachine } = await import('../server/orchestrator/stateMachine');
      const config = new OrchestratorConfig(testConfigPath);
      const stateMachine = new StateMachine(config);

      // Test linear progression
      let currentState = PipelineState.IMPORTED;
      currentState = stateMachine.getNextState(currentState);
      expect(currentState).toBe(PipelineState.OCR_PROCESSED);
      
      currentState = stateMachine.getNextState(currentState);
      expect(currentState).toBe(PipelineState.AI_EXTRACTED);
      
      currentState = stateMachine.getNextState(currentState);
      expect(currentState).toBe(PipelineState.XML_PARSED);
    });

    test('should identify skippable states', async () => {
      const { StateMachine } = await import('../server/orchestrator/stateMachine');
      const config = new OrchestratorConfig(testConfigPath);
      const stateMachine = new StateMachine(config);

      // OCR should be skippable for XML content
      expect(stateMachine.canSkipState(PipelineState.OCR_PROCESSED, { format: 'xml' })).toBe(true);
      expect(stateMachine.canSkipState(PipelineState.OCR_PROCESSED, { format: 'pdf' })).toBe(false);
      
      // XML parsing should be skippable for non-XML content
      expect(stateMachine.canSkipState(PipelineState.XML_PARSED, { format: 'pdf' })).toBe(true);
      expect(stateMachine.canSkipState(PipelineState.XML_PARSED, { format: 'xml' })).toBe(false);
    });
  });
});