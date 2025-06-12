import {
  users,
  invoices,
  lineItems,
  approvals,
  validationRules,
  settings,
  pettyCashLog,
  type User,
  type UpsertUser,
  type Invoice,
  type InsertInvoice,
  type LineItem,
  type InsertLineItem,
  type Approval,
  type InsertApproval,
  type ValidationRule,
  type InsertValidationRule,
  type Setting,
  type InsertSetting,
  type PettyCashLog,
  type InsertPettyCashLog,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, count, sum, sql } from "drizzle-orm";

// Interface for storage operations
export interface IStorage {
  // User operations
  // (IMPORTANT) these user operations are mandatory for Replit Auth.
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Invoice operations
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  getInvoice(id: number): Promise<Invoice | undefined>;
  getInvoicesByUserId(userId: string): Promise<Invoice[]>;
  updateInvoice(id: number, updates: Partial<InsertInvoice>): Promise<Invoice>;
  
  // Line item operations
  createLineItems(items: InsertLineItem[]): Promise<LineItem[]>;
  getLineItemsByInvoiceId(invoiceId: number): Promise<LineItem[]>;
  
  // Approval operations
  createApproval(approval: InsertApproval): Promise<Approval>;
  getApprovalsByInvoiceId(invoiceId: number): Promise<Approval[]>;
  updateApproval(id: number, updates: Partial<InsertApproval>): Promise<Approval>;
  getPendingApprovals(): Promise<(Approval & { invoice: Invoice })[]>;
  
  // Validation rules
  getValidationRules(): Promise<ValidationRule[]>;
  getValidationRule(id: number): Promise<ValidationRule | undefined>;
  createValidationRule(rule: InsertValidationRule): Promise<ValidationRule>;
  updateValidationRule(id: number, updates: Partial<InsertValidationRule>): Promise<ValidationRule>;
  deleteValidationRule(id: number): Promise<void>;
  validateInvoiceData(invoiceData: any): Promise<{
    isValid: boolean;
    violations: Array<{
      fieldName: string;
      ruleName: string;
      severity: string;
      message: string;
    }>;
  }>;
  
  // Dashboard stats
  getDashboardStats(userId?: string): Promise<{
    totalInvoices: number;
    pendingApproval: number;
    processedToday: number;
    totalValue: string;
  }>;
  
  // Settings operations
  getSetting(key: string): Promise<Setting | undefined>;
  setSetting(setting: InsertSetting): Promise<Setting>;
  updateSetting(key: string, value: string): Promise<Setting>;
  
  // Petty cash operations
  createPettyCashLog(log: InsertPettyCashLog): Promise<PettyCashLog>;
  updatePettyCashLog(id: number, updates: Partial<InsertPettyCashLog>): Promise<PettyCashLog>;
  getPettyCashLogByInvoiceId(invoiceId: number): Promise<PettyCashLog | undefined>;
  getPettyCashLogs(status?: string): Promise<(PettyCashLog & { invoice: Invoice })[]>;
  isPettyCashInvoice(totalAmount: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  // (IMPORTANT) these user operations are mandatory for Replit Auth.
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Invoice operations
  async createInvoice(invoice: InsertInvoice): Promise<Invoice> {
    const [created] = await db.insert(invoices).values(invoice).returning();
    return created;
  }

  async getInvoice(id: number): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice;
  }

  async getInvoicesByUserId(userId: string): Promise<Invoice[]> {
    return await db
      .select()
      .from(invoices)
      .where(eq(invoices.userId, userId))
      .orderBy(desc(invoices.createdAt));
  }

  async updateInvoice(id: number, updates: Partial<InsertInvoice>): Promise<Invoice> {
    const [updated] = await db
      .update(invoices)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(invoices.id, id))
      .returning();
    return updated;
  }

  // Line item operations
  async createLineItems(items: InsertLineItem[]): Promise<LineItem[]> {
    if (items.length === 0) return [];
    return await db.insert(lineItems).values(items).returning();
  }

  async getLineItemsByInvoiceId(invoiceId: number): Promise<LineItem[]> {
    return await db
      .select()
      .from(lineItems)
      .where(eq(lineItems.invoiceId, invoiceId));
  }

  // Approval operations
  async createApproval(approval: InsertApproval): Promise<Approval> {
    const [created] = await db.insert(approvals).values(approval).returning();
    return created;
  }

  async getApprovalsByInvoiceId(invoiceId: number): Promise<Approval[]> {
    return await db
      .select()
      .from(approvals)
      .where(eq(approvals.invoiceId, invoiceId));
  }

  async updateApproval(id: number, updates: Partial<InsertApproval>): Promise<Approval> {
    const [updated] = await db
      .update(approvals)
      .set({ ...updates, approvedAt: new Date() })
      .where(eq(approvals.id, id))
      .returning();
    return updated;
  }

  async getPendingApprovals(): Promise<(Approval & { invoice: Invoice })[]> {
    return await db
      .select({
        id: approvals.id,
        invoiceId: approvals.invoiceId,
        approverId: approvals.approverId,
        status: approvals.status,
        comments: approvals.comments,
        approvedAt: approvals.approvedAt,
        createdAt: approvals.createdAt,
        invoice: invoices,
      })
      .from(approvals)
      .innerJoin(invoices, eq(approvals.invoiceId, invoices.id))
      .where(eq(approvals.status, "pending"))
      .orderBy(desc(approvals.createdAt));
  }

  // Validation rules
  async getValidationRules(): Promise<ValidationRule[]> {
    return await db
      .select()
      .from(validationRules)
      .where(eq(validationRules.isActive, true))
      .orderBy(desc(validationRules.createdAt));
  }

  async getValidationRule(id: number): Promise<ValidationRule | undefined> {
    const [rule] = await db.select().from(validationRules).where(eq(validationRules.id, id));
    return rule;
  }

  async createValidationRule(rule: InsertValidationRule): Promise<ValidationRule> {
    const [created] = await db.insert(validationRules).values(rule).returning();
    return created;
  }

  async updateValidationRule(id: number, updates: Partial<InsertValidationRule>): Promise<ValidationRule> {
    const [updated] = await db
      .update(validationRules)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(validationRules.id, id))
      .returning();
    return updated;
  }

  async deleteValidationRule(id: number): Promise<void> {
    await db.delete(validationRules).where(eq(validationRules.id, id));
  }

  async validateInvoiceData(invoiceData: any): Promise<{
    isValid: boolean;
    violations: Array<{
      fieldName: string;
      ruleName: string;
      severity: string;
      message: string;
    }>;
  }> {
    const rules = await this.getValidationRules();
    const violations: Array<{
      fieldName: string;
      ruleName: string;
      severity: string;
      message: string;
    }> = [];

    for (const rule of rules) {
      const fieldValue = invoiceData[rule.fieldName];
      let isViolation = false;
      let errorMessage = rule.errorMessage || `Validation failed for ${rule.fieldName}`;

      switch (rule.ruleType) {
        case 'required':
          isViolation = !fieldValue || (typeof fieldValue === 'string' && fieldValue.trim() === '');
          errorMessage = rule.errorMessage || `${rule.fieldName} is required`;
          break;

        case 'regex':
          if (fieldValue) {
            const regex = new RegExp(rule.ruleValue);
            isViolation = !regex.test(String(fieldValue));
            errorMessage = rule.errorMessage || `${rule.fieldName} format is invalid`;
          }
          break;

        case 'range':
          if (fieldValue) {
            const [min, max] = rule.ruleValue.split(',').map(v => parseFloat(v.trim()));
            const numValue = parseFloat(String(fieldValue));
            isViolation = isNaN(numValue) || numValue < min || numValue > max;
            errorMessage = rule.errorMessage || `${rule.fieldName} must be between ${min} and ${max}`;
          }
          break;

        case 'enum':
          if (fieldValue) {
            const allowedValues = rule.ruleValue.split(',').map(v => v.trim());
            isViolation = !allowedValues.includes(String(fieldValue));
            errorMessage = rule.errorMessage || `${rule.fieldName} must be one of: ${rule.ruleValue}`;
          }
          break;

        case 'format':
          if (fieldValue && rule.ruleValue === 'email') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            isViolation = !emailRegex.test(String(fieldValue));
            errorMessage = rule.errorMessage || `${rule.fieldName} must be a valid email address`;
          }
          break;
      }

      if (isViolation) {
        violations.push({
          fieldName: rule.fieldName || '',
          ruleName: rule.name,
          severity: (rule.severity || 'medium') as string,
          message: errorMessage,
        });
      }
    }

    return {
      isValid: violations.length === 0,
      violations,
    };
  }

  // Dashboard stats
  async getDashboardStats(userId?: string): Promise<{
    totalInvoices: number;
    pendingApproval: number;
    processedToday: number;
    totalValue: string;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const baseQuery = userId 
      ? db.select().from(invoices).where(eq(invoices.userId, userId))
      : db.select().from(invoices);

    // Total invoices
    const [totalResult] = await db
      .select({ count: count() })
      .from(invoices)
      .where(userId ? eq(invoices.userId, userId) : undefined);

    // Pending approvals
    const [pendingResult] = await db
      .select({ count: count() })
      .from(approvals)
      .innerJoin(invoices, eq(approvals.invoiceId, invoices.id))
      .where(
        and(
          eq(approvals.status, "pending"),
          userId ? eq(invoices.userId, userId) : undefined
        )
      );

    // Processed today
    const [processedTodayResult] = await db
      .select({ count: count() })
      .from(invoices)
      .where(
        and(
          sql`DATE(${invoices.updatedAt}) = CURRENT_DATE`,
          userId ? eq(invoices.userId, userId) : undefined
        )
      );

    // Total value
    const [totalValueResult] = await db
      .select({ sum: sum(invoices.totalAmount) })
      .from(invoices)
      .where(userId ? eq(invoices.userId, userId) : undefined);

    return {
      totalInvoices: totalResult.count,
      pendingApproval: pendingResult.count,
      processedToday: processedTodayResult.count,
      totalValue: totalValueResult.sum || "0",
    };
  }

  // Settings operations
  async getSetting(key: string): Promise<Setting | undefined> {
    const [setting] = await db.select().from(settings).where(eq(settings.key, key));
    return setting;
  }

  async setSetting(setting: InsertSetting): Promise<Setting> {
    const [newSetting] = await db
      .insert(settings)
      .values(setting)
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          value: setting.value,
          description: setting.description,
          updatedAt: new Date(),
        },
      })
      .returning();
    return newSetting;
  }

  async updateSetting(key: string, value: string): Promise<Setting> {
    const [updatedSetting] = await db
      .update(settings)
      .set({ value, updatedAt: new Date() })
      .where(eq(settings.key, key))
      .returning();
    return updatedSetting;
  }

  // Petty cash operations
  async createPettyCashLog(log: InsertPettyCashLog): Promise<PettyCashLog> {
    const [newLog] = await db
      .insert(pettyCashLog)
      .values(log)
      .returning();
    return newLog;
  }

  async updatePettyCashLog(id: number, updates: Partial<InsertPettyCashLog>): Promise<PettyCashLog> {
    const [updatedLog] = await db
      .update(pettyCashLog)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(pettyCashLog.id, id))
      .returning();
    return updatedLog;
  }

  async getPettyCashLogByInvoiceId(invoiceId: number): Promise<PettyCashLog | undefined> {
    const [log] = await db
      .select()
      .from(pettyCashLog)
      .where(eq(pettyCashLog.invoiceId, invoiceId));
    return log;
  }

  async getPettyCashLogs(status?: string): Promise<(PettyCashLog & { invoice: Invoice })[]> {
    const query = db
      .select({
        id: pettyCashLog.id,
        invoiceId: pettyCashLog.invoiceId,
        projectId: pettyCashLog.projectId,
        costCenter: pettyCashLog.costCenter,
        approvedBy: pettyCashLog.approvedBy,
        approvalFileUrl: pettyCashLog.approvalFileUrl,
        status: pettyCashLog.status,
        approvalNotes: pettyCashLog.approvalNotes,
        approvedAt: pettyCashLog.approvedAt,
        createdAt: pettyCashLog.createdAt,
        updatedAt: pettyCashLog.updatedAt,
        invoice: invoices,
      })
      .from(pettyCashLog)
      .innerJoin(invoices, eq(pettyCashLog.invoiceId, invoices.id));

    if (status) {
      query.where(eq(pettyCashLog.status, status as any));
    }

    return query.orderBy(desc(pettyCashLog.createdAt));
  }

  async isPettyCashInvoice(totalAmount: string): Promise<boolean> {
    const thresholdSetting = await this.getSetting('petty_cash_threshold');
    if (!thresholdSetting) {
      // Default threshold: 1000 MXN
      await this.setSetting({
        key: 'petty_cash_threshold',
        value: '1000',
        description: 'Threshold amount for petty cash invoices in MXN',
      });
      return parseFloat(totalAmount) < 1000;
    }
    
    const threshold = parseFloat(thresholdSetting.value);
    return parseFloat(totalAmount) < threshold;
  }
}

export const storage = new DatabaseStorage();
