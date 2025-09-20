import * as fs from 'fs/promises';
import * as path from 'path';
import { Database } from 'sqlite3';
import { promisify } from 'util';
import { PipelineState } from './stateMachine';

export interface IdempotencyRecord {
  fingerprint: string;
  stage: PipelineState;
  tenantId: string;
  completedAt: string;
  data?: any;
  checksum?: string;
}

export class IdempotencyStore {
  private db: Database | null = null;
  private dbPath: string;
  private dbRun: (sql: string, params?: any[]) => Promise<void>;
  private dbGet: (sql: string, params?: any[]) => Promise<any>;
  private dbAll: (sql: string, params?: any[]) => Promise<any[]>;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || '.orchestrator/idempotency.db';
    this.dbRun = () => Promise.reject('Database not initialized');
    this.dbGet = () => Promise.reject('Database not initialized');
    this.dbAll = () => Promise.reject('Database not initialized');
  }

  async initialize(): Promise<void> {
    try {
      // Ensure the directory exists
      const dir = path.dirname(this.dbPath);
      await fs.mkdir(dir, { recursive: true });

      // Initialize SQLite database
      await this.initializeDatabase();
      
      console.log(`SQLite idempotency store initialized at: ${this.dbPath}`);
    } catch (error) {
      console.error('Failed to initialize SQLite idempotency store:', error);
      throw error;
    }
  }

  private async initializeDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Promisify database methods
        this.dbRun = promisify(this.db!.run.bind(this.db!));
        this.dbGet = promisify(this.db!.get.bind(this.db!));
        this.dbAll = promisify(this.db!.all.bind(this.db!));
        
        // Create table if not exists
        this.db!.run(`
          CREATE TABLE IF NOT EXISTS idempotency_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id TEXT NOT NULL,
            fingerprint TEXT NOT NULL,
            stage TEXT NOT NULL,
            completed_at TEXT NOT NULL,
            data TEXT,
            checksum TEXT,
            UNIQUE(tenant_id, fingerprint, stage)
          )
        `, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });
  }

  async close(): Promise<void> {
    if (this.db) {
      return new Promise((resolve) => {
        this.db!.close((err) => {
          if (err) {
            console.error('Error closing database:', err);
          }
          resolve();
        });
      });
    }
  }

  // Remove the old generateKey method as we're using database now

  private generateChecksum(data: any): string {
    // Simple checksum generation using JSON string hash
    const crypto = require('crypto');
    const jsonString = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHash('md5').update(jsonString).digest('hex');
  }

  /**
   * Check if a stage has been completed for a given invoice
   */
  async isStageCompleted(
    fingerprint: string, 
    stage: PipelineState, 
    tenantId: string
  ): Promise<boolean> {
    const record = await this.dbGet(
      'SELECT id FROM idempotency_records WHERE tenant_id = ? AND fingerprint = ? AND stage = ?',
      [tenantId, fingerprint, stage]
    );
    return !!record;
  }

  /**
   * Mark a stage as completed
   */
  async markStageCompleted(
    fingerprint: string,
    stage: PipelineState,
    tenantId: string,
    data?: any
  ): Promise<void> {
    const completedAt = new Date().toISOString();
    const dataJson = data ? JSON.stringify(data) : null;
    const checksum = data ? this.generateChecksum(data) : null;
    
    await this.dbRun(
      `INSERT OR REPLACE INTO idempotency_records 
       (tenant_id, fingerprint, stage, completed_at, data, checksum) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tenantId, fingerprint, stage, completedAt, dataJson, checksum]
    );
  }

  /**
   * Get completion record for a stage
   */
  async getCompletionRecord(
    fingerprint: string,
    stage: PipelineState,
    tenantId: string
  ): Promise<IdempotencyRecord | null> {
    const row = await this.dbGet(
      'SELECT * FROM idempotency_records WHERE tenant_id = ? AND fingerprint = ? AND stage = ?',
      [tenantId, fingerprint, stage]
    );
    
    if (!row) return null;
    
    return {
      fingerprint: row.fingerprint,
      stage: row.stage,
      tenantId: row.tenant_id,
      completedAt: row.completed_at,
      data: row.data ? JSON.parse(row.data) : undefined,
      checksum: row.checksum
    };
  }

  /**
   * Get all completed stages for an invoice
   */
  async getCompletedStages(
    fingerprint: string,
    tenantId: string
  ): Promise<PipelineState[]> {
    const rows = await this.dbAll(
      'SELECT stage FROM idempotency_records WHERE tenant_id = ? AND fingerprint = ?',
      [tenantId, fingerprint]
    );
    
    return rows.map(row => row.stage as PipelineState);
  }

  /**
   * Clear completion record for a specific stage
   */
  async clearStageCompletion(
    fingerprint: string,
    stage: PipelineState,
    tenantId: string
  ): Promise<void> {
    await this.dbRun(
      'DELETE FROM idempotency_records WHERE tenant_id = ? AND fingerprint = ? AND stage = ?',
      [tenantId, fingerprint, stage]
    );
  }

  /**
   * Clear all completion records for an invoice
   */
  async clearInvoiceCompletions(
    fingerprint: string,
    tenantId: string
  ): Promise<void> {
    await this.dbRun(
      'DELETE FROM idempotency_records WHERE tenant_id = ? AND fingerprint = ?',
      [tenantId, fingerprint]
    );
  }

  /**
   * Get statistics about the idempotency store
   */
  async getStatistics(): Promise<{
    totalRecords: number;
    recordsByTenant: Record<string, number>;
    recordsByStage: Record<string, number>;
    oldestRecord?: string;
    newestRecord?: string;
  }> {
    const totalRows = await this.dbGet('SELECT COUNT(*) as count FROM idempotency_records');
    const tenantRows = await this.dbAll('SELECT tenant_id, COUNT(*) as count FROM idempotency_records GROUP BY tenant_id');
    const stageRows = await this.dbAll('SELECT stage, COUNT(*) as count FROM idempotency_records GROUP BY stage');
    const timeRows = await this.dbGet('SELECT MIN(completed_at) as oldest, MAX(completed_at) as newest FROM idempotency_records');

    const stats = {
      totalRecords: totalRows.count,
      recordsByTenant: {} as Record<string, number>,
      recordsByStage: {} as Record<string, number>,
      oldestRecord: timeRows.oldest,
      newestRecord: timeRows.newest
    };

    tenantRows.forEach((row: any) => {
      stats.recordsByTenant[row.tenant_id] = row.count;
    });

    stageRows.forEach((row: any) => {
      stats.recordsByStage[row.stage] = row.count;
    });

    return stats;
  }

  /**
   * Clean up old records (older than specified days)
   */
  async cleanupOldRecords(olderThanDays: number = 30): Promise<number> {
    const cutoffTime = new Date(Date.now() - (olderThanDays * 24 * 60 * 60 * 1000)).toISOString();
    
    const countResult = await this.dbGet(
      'SELECT COUNT(*) as count FROM idempotency_records WHERE completed_at < ?',
      [cutoffTime]
    );
    
    await this.dbRun(
      'DELETE FROM idempotency_records WHERE completed_at < ?',
      [cutoffTime]
    );

    return countResult.count;
  }

  /**
   * Export idempotency records for backup/audit
   */
  async exportRecords(filePath?: string): Promise<IdempotencyRecord[]> {
    const rows = await this.dbAll('SELECT * FROM idempotency_records ORDER BY completed_at');
    
    const records: IdempotencyRecord[] = rows.map(row => ({
      fingerprint: row.fingerprint,
      stage: row.stage,
      tenantId: row.tenant_id,
      completedAt: row.completed_at,
      data: row.data ? JSON.parse(row.data) : undefined,
      checksum: row.checksum
    }));
    
    if (filePath) {
      await fs.writeFile(filePath, JSON.stringify(records, null, 2));
    }
    
    return records;
  }

  /**
   * Import idempotency records from backup
   */
  async importRecords(records: IdempotencyRecord[], merge: boolean = true): Promise<void> {
    if (!merge) {
      await this.dbRun('DELETE FROM idempotency_records');
    }

    for (const record of records) {
      const dataJson = record.data ? JSON.stringify(record.data) : null;
      await this.dbRun(
        `INSERT OR REPLACE INTO idempotency_records 
         (tenant_id, fingerprint, stage, completed_at, data, checksum) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [record.tenantId, record.fingerprint, record.stage, record.completedAt, dataJson, record.checksum]
      );
    }
  }

  /**
   * Verify data integrity using checksums
   */
  async verifyIntegrity(): Promise<{ valid: number; invalid: IdempotencyRecord[] }> {
    const rows = await this.dbAll('SELECT * FROM idempotency_records WHERE data IS NOT NULL AND checksum IS NOT NULL');
    const invalid: IdempotencyRecord[] = [];
    let valid = 0;

    for (const row of rows) {
      const data = JSON.parse(row.data);
      const expectedChecksum = this.generateChecksum(data);
      
      if (expectedChecksum === row.checksum) {
        valid++;
      } else {
        invalid.push({
          fingerprint: row.fingerprint,
          stage: row.stage,
          tenantId: row.tenant_id,
          completedAt: row.completed_at,
          data,
          checksum: row.checksum
        });
      }
    }

    // Add records without data/checksum as valid
    const recordsWithoutDataResult = await this.dbGet(
      'SELECT COUNT(*) as count FROM idempotency_records WHERE data IS NULL OR checksum IS NULL'
    );
    valid += recordsWithoutDataResult.count;

    return { valid, invalid };
  }
}