import {
  users,
  invoices,
  lineItems,
  approvals,
  validationRules,
  settings,
  pettyCashLog,
  projects,
  purchaseOrders,
  invoicePoMatches,
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
  type Project,
  type InsertProject,
  type PurchaseOrder,
  type InsertPurchaseOrder,
  type InvoicePoMatch,
  type InsertInvoicePoMatch,
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

  // Project operations
  getProjects(): Promise<Project[]>;
  getProject(projectId: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(projectId: string, updates: Partial<InsertProject>): Promise<Project>;

  // Purchase order operations
  getPurchaseOrders(): Promise<PurchaseOrder[]>;
  getPurchaseOrder(id: number): Promise<PurchaseOrder | undefined>;
  getPurchaseOrderByPoId(poId: string): Promise<PurchaseOrder | undefined>;
  createPurchaseOrder(po: InsertPurchaseOrder): Promise<PurchaseOrder>;
  updatePurchaseOrder(id: number, updates: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder>;

  // Invoice-PO matching operations
  createInvoicePoMatch(match: InsertInvoicePoMatch): Promise<InvoicePoMatch>;
  updateInvoicePoMatch(id: number, updates: Partial<InsertInvoicePoMatch>): Promise<InvoicePoMatch>;
  getInvoicePoMatches(invoiceId: number): Promise<(InvoicePoMatch & { purchaseOrder: PurchaseOrder })[]>;
  getUnresolvedMatches(): Promise<(InvoicePoMatch & { invoice: Invoice; purchaseOrder: PurchaseOrder })[]>;
  findPotentialMatches(invoice: Invoice, lineItems: LineItem[]): Promise<{
    purchaseOrder: PurchaseOrder;
    matchScore: number;
    matchDetails: any;
  }[]>;
  assignProjectToInvoice(invoiceId: number, projectId: string): Promise<void>;

  // Discrepancy detection operations
  createInvoiceFlags(flags: InsertInvoiceFlag[]): Promise<InvoiceFlag[]>;
  getInvoiceFlags(invoiceId: number): Promise<InvoiceFlag[]>;
  resolveInvoiceFlag(flagId: number, resolvedBy: string): Promise<InvoiceFlag>;
  getAllUnresolvedFlags(): Promise<(InvoiceFlag & { invoice: Invoice })[]>;

  // Predictive alerts operations
  createPredictiveAlerts(alerts: InsertPredictiveAlert[]): Promise<PredictiveAlert[]>;
  getPredictiveAlerts(invoiceId: number): Promise<PredictiveAlert[]>;
  getTopIssuesThisMonth(): Promise<any[]>;
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

  // Project operations
  async getProjects(): Promise<Project[]> {
    return await db.select().from(projects).orderBy(desc(projects.createdAt));
  }

  async getProject(projectId: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.projectId, projectId));
    return project;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [newProject] = await db.insert(projects).values(project).returning();
    return newProject;
  }

  async updateProject(projectId: string, updates: Partial<InsertProject>): Promise<Project> {
    const [updatedProject] = await db
      .update(projects)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(projects.projectId, projectId))
      .returning();
    return updatedProject;
  }

  // Purchase order operations
  async getPurchaseOrders(): Promise<PurchaseOrder[]> {
    return await db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.createdAt));
  }

  async getPurchaseOrder(id: number): Promise<PurchaseOrder | undefined> {
    const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
    return po;
  }

  async getPurchaseOrderByPoId(poId: string): Promise<PurchaseOrder | undefined> {
    const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.poId, poId));
    return po;
  }

  async createPurchaseOrder(po: InsertPurchaseOrder): Promise<PurchaseOrder> {
    const [newPo] = await db.insert(purchaseOrders).values(po).returning();
    return newPo;
  }

  async updatePurchaseOrder(id: number, updates: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder> {
    const [updatedPo] = await db
      .update(purchaseOrders)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(purchaseOrders.id, id))
      .returning();
    return updatedPo;
  }

  // Invoice-PO matching operations
  async createInvoicePoMatch(match: InsertInvoicePoMatch): Promise<InvoicePoMatch> {
    const [newMatch] = await db.insert(invoicePoMatches).values(match).returning();
    return newMatch;
  }

  async updateInvoicePoMatch(id: number, updates: Partial<InsertInvoicePoMatch>): Promise<InvoicePoMatch> {
    const [updatedMatch] = await db
      .update(invoicePoMatches)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(invoicePoMatches.id, id))
      .returning();
    return updatedMatch;
  }

  async getInvoicePoMatches(invoiceId: number): Promise<(InvoicePoMatch & { purchaseOrder: PurchaseOrder })[]> {
    return await db
      .select({
        id: invoicePoMatches.id,
        invoiceId: invoicePoMatches.invoiceId,
        poId: invoicePoMatches.poId,
        matchScore: invoicePoMatches.matchScore,
        status: invoicePoMatches.status,
        matchDetails: invoicePoMatches.matchDetails,
        createdAt: invoicePoMatches.createdAt,
        updatedAt: invoicePoMatches.updatedAt,
        purchaseOrder: purchaseOrders,
      })
      .from(invoicePoMatches)
      .innerJoin(purchaseOrders, eq(invoicePoMatches.poId, purchaseOrders.id))
      .where(eq(invoicePoMatches.invoiceId, invoiceId));
  }

  async getUnresolvedMatches(): Promise<(InvoicePoMatch & { invoice: Invoice; purchaseOrder: PurchaseOrder })[]> {
    return await db
      .select({
        id: invoicePoMatches.id,
        invoiceId: invoicePoMatches.invoiceId,
        poId: invoicePoMatches.poId,
        matchScore: invoicePoMatches.matchScore,
        status: invoicePoMatches.status,
        matchDetails: invoicePoMatches.matchDetails,
        createdAt: invoicePoMatches.createdAt,
        updatedAt: invoicePoMatches.updatedAt,
        invoice: invoices,
        purchaseOrder: purchaseOrders,
      })
      .from(invoicePoMatches)
      .innerJoin(invoices, eq(invoicePoMatches.invoiceId, invoices.id))
      .innerJoin(purchaseOrders, eq(invoicePoMatches.poId, purchaseOrders.id))
      .where(eq(invoicePoMatches.status, 'unresolved'));
  }

  async findPotentialMatches(invoice: Invoice, lineItems: LineItem[]): Promise<{
    purchaseOrder: PurchaseOrder;
    matchScore: number;
    matchDetails: any;
  }[]> {
    // Get all open purchase orders
    const openPOs = await db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.status, 'open'));

    const matches = [];

    for (const po of openPOs) {
      let matchScore = 0;
      const matchDetails: any = {
        vendorMatch: false,
        amountMatch: false,
        itemMatches: [],
        totalItemsMatched: 0,
      };

      // 1. Vendor name matching (40% weight)
      if (invoice.vendorName && po.vendorName) {
        const vendorSimilarity = this.calculateStringSimilarity(
          invoice.vendorName.toLowerCase(),
          po.vendorName.toLowerCase()
        );
        if (vendorSimilarity > 0.8) {
          matchScore += 40;
          matchDetails.vendorMatch = true;
        }
      }

      // 2. Amount matching (30% weight)
      if (invoice.totalAmount && po.amount) {
        const invoiceAmount = parseFloat(invoice.totalAmount.toString());
        const poAmount = parseFloat(po.amount.toString());
        const amountDifference = Math.abs(invoiceAmount - poAmount) / poAmount;
        
        if (amountDifference <= 0.05) { // Exact match (within 5%)
          matchScore += 30;
          matchDetails.amountMatch = true;
        } else if (amountDifference <= 0.10) { // Fuzzy match (within 10%)
          matchScore += 15;
          matchDetails.amountMatch = 'fuzzy';
        }
      }

      // 3. Line item matching (30% weight)
      if (lineItems.length > 0 && po.items) {
        const poItems = Array.isArray(po.items) ? po.items : [];
        let itemMatchScore = 0;
        
        for (const lineItem of lineItems) {
          for (const poItem of poItems) {
            const descriptionSimilarity = this.calculateStringSimilarity(
              lineItem.description.toLowerCase(),
              poItem.description?.toLowerCase() || ''
            );
            
            if (descriptionSimilarity > 0.7) {
              itemMatchScore += descriptionSimilarity;
              matchDetails.itemMatches.push({
                invoiceItem: lineItem.description,
                poItem: poItem.description,
                similarity: descriptionSimilarity,
              });
              matchDetails.totalItemsMatched++;
            }
          }
        }
        
        // Normalize item match score
        if (matchDetails.totalItemsMatched > 0) {
          matchScore += (itemMatchScore / lineItems.length) * 30;
        }
      }

      // Only include matches with a minimum score
      if (matchScore >= 40) {
        matches.push({
          purchaseOrder: po,
          matchScore: Math.round(matchScore),
          matchDetails,
        });
      }
    }

    // Sort by match score descending
    return matches.sort((a, b) => b.matchScore - a.matchScore);
  }

  async assignProjectToInvoice(invoiceId: number, projectId: string): Promise<void> {
    // For now, we'll store the project assignment in the extractedData field
    // In a more complete implementation, you might add a projectId field to the invoices table
    const invoice = await this.getInvoice(invoiceId);
    if (invoice) {
      const currentData = invoice.extractedData || {};
      const updatedData = {
        ...(typeof currentData === 'object' ? currentData : {}),
        assignedProject: projectId,
      };
      
      await db
        .update(invoices)
        .set({ extractedData: updatedData })
        .where(eq(invoices.id, invoiceId));
    }
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    // Simple Levenshtein distance-based similarity
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1;
    
    const distance = this.levenshteinDistance(str1, str2);
    return (maxLength - distance) / maxLength;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }
}

export const storage = new DatabaseStorage();
