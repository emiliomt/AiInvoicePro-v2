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
  invoiceProjectMatches,
  approvedInvoiceProject,
  verifiedInvoiceProject,
  invoiceFlags,
  predictiveAlerts,
  feedbackLogs,
  classificationKeywords,
  lineItemClassifications,
  type User,
  type UpsertUser,
  type InsertInvoice,
  type Invoice,
  type InsertLineItem,
  type LineItem,
  type InsertApproval,
  type Approval,
  type InsertValidationRule,
  type ValidationRule,
  type InsertSetting,
  type Setting,
  type InsertPettyCashLog,
  type PettyCashLog,
  type InsertProject,
  type Project,
  type InsertPurchaseOrder,
  type PurchaseOrder,
  type InsertInvoicePoMatch,
  type InvoicePoMatch,
  type InsertInvoiceProjectMatch,
  type InvoiceProjectMatch,
  type InsertApprovedInvoiceProject,
  type ApprovedInvoiceProject,
  type InsertVerifiedInvoiceProject,
  type VerifiedInvoiceProject,
  type InsertInvoiceFlag,
  type InvoiceFlag,
  type InsertPredictiveAlert,
  type PredictiveAlert,
  type InsertFeedbackLog,
  type FeedbackLog,
  type InsertClassificationKeyword,
  type ClassificationKeyword,
  type InsertLineItemClassification,
  type LineItemClassification,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, like, sql, isNull, isNotNull, inArray, ne, count, sum, gte, lte } from "drizzle-orm";

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
  deleteInvoice(id: number): Promise<void>;

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
  deleteProject(projectId: string): Promise<void>;
  deleteAllProjects(): Promise<void>;

  // Purchase order operations
  getPurchaseOrders(): Promise<PurchaseOrder[]>;
  getPurchaseOrder(id: number): Promise<PurchaseOrder | undefined>;
  getPurchaseOrderByPoId(poId: string): Promise<PurchaseOrder | undefined>;
  createPurchaseOrder(po: InsertPurchaseOrder): Promise<PurchaseOrder>;
  updatePurchaseOrder(id: number, updates: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder>;
  deletePurchaseOrder(id: number): Promise<void>;

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

  // Project matching operations
  createInvoiceProjectMatch(match: InsertInvoiceProjectMatch): Promise<InvoiceProjectMatch>;
  updateInvoiceProjectMatch(id: number, updates: Partial<InsertInvoiceProjectMatch>): Promise<InvoiceProjectMatch>;
  getInvoiceProjectMatches(invoiceId: number): Promise<(InvoiceProjectMatch & { project: Project })[]>;
  getUnresolvedProjectMatches(): Promise<(InvoiceProjectMatch & { invoice: Invoice; project: Project })[]>;
  findPotentialProjectMatches(invoice: Invoice): Promise<{
    project: Project;
    matchScore: number;
    matchDetails: any;
  }[]>;
  setActiveProjectMatch(invoiceId: number, matchId: number): Promise<void>;

  // Approved Invoice Project operations
  createApprovedInvoiceProject(data: InsertApprovedInvoiceProject): Promise<ApprovedInvoiceProject>;
  getApprovedInvoiceProjects(): Promise<(ApprovedInvoiceProject & { invoice: Invoice; project: Project })[]>;
  getApprovedInvoiceProjectByInvoiceId(invoiceId: number): Promise<(ApprovedInvoiceProject & { project: Project }) | null>;

    // Feedback log methods
  createFeedbackLog(feedbackData: InsertFeedbackLog): Promise<any>;
  getFeedbackLogs(limit?: number): Promise<any>;
  getFeedbackLog(id: number): Promise<any>;

    // Classification methods
  getClassificationKeywords(userId?: string): Promise<Record<string, { id: number; keyword: string; isDefault: boolean }[]>>;
  addClassificationKeyword(data: InsertClassificationKeyword): Promise<any>;
  removeClassificationKeyword(keywordId: number, userId: string): Promise<void>;
  getLineItemClassifications(invoiceId: number): Promise<any[]>;
  updateLineItemClassification(lineItemId: number, category: string, userId: string): Promise<void>;

    // Learning tracking methods
  getFeedbackLogsInTimeframe(startDate: Date): Promise<any>;
  getExtractionsInTimeframe(startDate: Date): Promise<number>;
  getRecentFeedbackLogs(days: number): Promise<any>;
  getFeedbackLogsInRange(olderThanDays: number, newerThanDays: number): Promise<any>;
  getExtractionsForDate(date: Date): Promise<number>;
  getFeedbackLogsForDate(date: Date): Promise<any>;
  getTotalFeedbackCount(): Promise<number>;
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

  async getInvoicesWithProjectMatches(userId: string): Promise<(Invoice & { projectMatches: any[] })[]> {
    const invoicesList = await this.getInvoicesByUserId(userId);

    const invoicesWithMatches = await Promise.all(
      invoicesList.map(async (invoice) => {
        const matches = await this.getInvoiceProjectMatches(invoice.id);
        return {
          ...invoice,
          projectMatches: matches
        };
      })
    );

    // Filter to only include invoices that have project matches
    return invoicesWithMatches.filter(invoice => invoice.projectMatches.length > 0);
  }

  async updateInvoice(id: number, updates: Partial<InsertInvoice>): Promise<Invoice> {
    const [updated] = await db
      .update(invoices)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(invoices.id, id))
      .returning();
    return updated;
  }

  async deleteInvoice(id: number): Promise<void> {
    // Delete related records first to maintain referential integrity

    // Delete line items
    await db.delete(lineItems).where(eq(lineItems.invoiceId, id));

    // Delete approvals
    await db.delete(approvals).where(eq(approvals.invoiceId, id));

    // Delete invoice-PO matches
    await db.delete(invoicePoMatches).where(eq(invoicePoMatches.invoiceId, id));

    // Delete invoice-project matches
    await db.delete(invoiceProjectMatches).where(eq(invoiceProjectMatches.invoiceId, id));

    // Delete invoice flags
    await db.delete(invoiceFlags).where(eq(invoiceFlags.invoiceId, id));

    // Delete predictive alerts
    await db.delete(predictiveAlerts).where(eq(predictiveAlerts.invoiceId, id));

    // Delete petty cash logs
    await db.delete(pettyCashLog).where(eq(pettyCashLog.invoiceId, id));

    // Finally delete the invoice
    await db.delete(invoices).where(eq(invoices.id, id));
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
      // Handle nested field paths like extractedData.companyName
      let fieldValue;
      if (rule.fieldName.includes('.')) {
        const fieldPath = rule.fieldName.split('.');
        fieldValue = invoiceData;
        for (const path of fieldPath) {
          fieldValue = fieldValue?.[path];
        }
      } else {
        fieldValue = invoiceData[rule.fieldName];
      }
      
      let isViolation = false;
      let errorMessage = rule.errorMessage || `Validation failed for ${rule.fieldName}`;

      switch (rule.ruleType) {
        case 'required':
          isViolation = !fieldValue || (typeof fieldValue === 'string' && fieldValue.trim() === '');
          errorMessage = rule.errorMessage || `${rule.fieldName} is required`;
          break;

        case 'regex':
          if (fieldValue) {
            const regex = new RegExp(rule.ruleValue || rule.ruleData);
            isViolation = !regex.test(String(fieldValue));
            errorMessage = rule.errorMessage || `${rule.fieldName} format is invalid`;
          }
          break;

        case 'range':
          if (fieldValue) {
            const ruleValueData = rule.ruleValue || rule.ruleData;
            const [min, max] = ruleValueData?.split(',').map(v => parseFloat(v.trim())) || [0, 0];
            const numValue = parseFloat(String(fieldValue));
            isViolation = isNaN(numValue) || numValue < min || numValue > max;
            errorMessage = rule.errorMessage || `${rule.fieldName} must be between ${min} and ${max}`;
          }
          break;

        case 'enum':
          if (fieldValue) {
            const ruleValueData = rule.ruleValue || rule.ruleData;
            const allowedValues = ruleValueData?.split(',').map(v => v.trim()) || [];
            isViolation = !allowedValues.includes(String(fieldValue));
            errorMessage = rule.errorMessage || `${rule.fieldName} must be one of: ${ruleValueData}`;
          }
          break;

        case 'format':
          if (fieldValue) {
            const ruleValueData = rule.ruleValue || rule.ruleData;
            if (ruleValueData === 'email') {
              const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
              isViolation = !emailRegex.test(String(fieldValue));
              errorMessage = rule.errorMessage || `${rule.fieldName} must be a valid email address`;
            }
          }
          break;

        case 'comparison':
          if (fieldValue) {
            const numValue = parseFloat(String(fieldValue));
            if (!isNaN(numValue)) {
              // Parse comparison operator and value from rule.ruleValue
              const ruleValueData = rule.ruleValue || rule.ruleData;
              const comparisonMatch = ruleValueData?.match(/^(>=|<=|>|<|=|!=)\s*(-?\d+(?:\.\d+)?)$/);
              if (comparisonMatch) {
                const [, operator, targetValue] = comparisonMatch;
                const targetNum = parseFloat(targetValue);

                switch (operator) {
                  case '>':
                    isViolation = !(numValue > targetNum);
                    break;
                  case '>=':
                    isViolation = !(numValue >= targetNum);
                    break;
                  case '<':
                    isViolation = !(numValue < targetNum);
                    break;
                  case '<=':
                    isViolation = !(numValue <= targetNum);
                    break;
                  case '=':
                    isViolation = !(numValue === targetNum);
                    break;
                  case '!=':
                    isViolation = !(numValue !== targetNum);
                    break;
                }

                if (isViolation) {
                  errorMessage = rule.errorMessage || `${rule.fieldName} must be ${operator} ${targetValue}`;
                }
              } else {
                isViolation = true;
                errorMessage = rule.errorMessage || `Invalid comparison format for ${rule.fieldName}`;
              }
            } else {
              isViolation = true;
              errorMessage = rule.errorMessage || `${rule.fieldName} must be a valid number for comparison`;
            }
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

  async validateAllApprovedInvoices(): Promise<{
    totalInvoices: number;
    verified: number;
    flagged: number;
    needsReview: number;
    pending: number;
    invoiceValidations: Array<{
      invoiceId: number;
      fileName: string;
      vendorName: string;
      isValid: boolean;
      violations: Array<{
        field: string;
        ruleType: string;
        message: string;
        severity: string;
      }>;
    }>;
  }> {
    // Get all invoices with approved project assignments that haven't been verified yet
    const approvedInvoices = await db
      .select({
        approvedId: approvedInvoiceProject.id,
        invoiceId: approvedInvoiceProject.invoiceId,
        invoice: invoices,
        approvedBy: approvedInvoiceProject.approvedBy,
        approvedAt: approvedInvoiceProject.approvedAt,
        matchScore: approvedInvoiceProject.matchScore,
        matchDetails: approvedInvoiceProject.matchDetails,
        originalMatchId: approvedInvoiceProject.originalMatchId,
        projectId: approvedInvoiceProject.projectId,
      })
      .from(approvedInvoiceProject)
      .innerJoin(invoices, eq(approvedInvoiceProject.invoiceId, invoices.id));

    const validationResults = [];
    let verified = 0;
    let flagged = 0;
    let needsReview = 0;
    let pending = 0;

    for (const { invoice } of approvedInvoices) {
      // Create validation data object from invoice extracted data
      const validationData: any = {};
      
      if (invoice.extractedData) {
        try {
          const extracted = typeof invoice.extractedData === 'string' 
            ? JSON.parse(invoice.extractedData) 
            : invoice.extractedData;
          
          // Map extracted data fields to validation fields
          validationData.vendorName = extracted.vendorName || extracted.companyName;
          validationData.invoiceNumber = extracted.invoiceNumber;
          validationData.totalAmount = extracted.totalAmount;
          validationData.taxAmount = extracted.taxAmount;
          validationData.invoiceDate = extracted.invoiceDate;
          validationData.dueDate = extracted.dueDate;
          validationData.taxId = extracted.taxId;
          validationData.currency = extracted.currency;
        } catch (error) {
          console.error('Error parsing extracted data for invoice', invoice.id, error);
        }
      }

      // Run validation
      const validationResult = await this.validateInvoiceData(validationData);
      
      const invoiceValidation = {
        invoiceId: invoice.id,
        fileName: invoice.fileName || 'Unknown',
        vendorName: validationData.vendorName || 'Unknown',
        isValid: validationResult.isValid,
        violations: validationResult.violations.map(v => ({
          field: v.fieldName,
          ruleType: v.ruleName,
          message: v.message,
          severity: v.severity,
        })),
      };

      validationResults.push(invoiceValidation);

      // Categorize validation results
      if (validationResult.isValid) {
        verified++;
      } else {
        const hasCriticalViolations = validationResult.violations.some(v => v.severity === 'critical');
        const hasHighViolations = validationResult.violations.some(v => v.severity === 'high');
        
        if (hasCriticalViolations) {
          flagged++;
        } else if (hasHighViolations || validationResult.violations.length > 0) {
          needsReview++;
        } else {
          pending++;
        }
      }
    }

    return {
      totalInvoices: approvedInvoices.length,
      verified,
      flagged,
      needsReview,
      pending,
      invoiceValidations: validationResults,
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

  async deleteProject(projectId: string): Promise<void> {
    // Check if project has associated purchase orders
    const [associatedPOs] = await db
      .select({ count: count() })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.projectId, projectId));

    if (associatedPOs.count > 0) {
      throw new Error(`Cannot delete project ${projectId} because it has ${associatedPOs.count} associated purchase order(s). Please remove or reassign the purchase orders first.`);
    }

    // Check if project has associated invoice matches through purchase orders
    const associatedInvoiceMatches = await db
      .select({ count: count() })
      .from(invoicePoMatches)
      .innerJoin(purchaseOrders, eq(invoicePoMatches.poId, purchaseOrders.id))
      .where(eq(purchaseOrders.projectId, projectId));

    if (associatedInvoiceMatches.length > 0 && associatedInvoiceMatches[0].count > 0) {
      throw new Error(`Cannot delete project ${projectId} because it has associated invoice-PO matches. Please resolve these matches first.`);
    }

    await db.delete(projects).where(eq(projects.projectId, projectId));
  }

  async deleteAllProjects(): Promise<void> {
    try {
      console.log("Starting deleteAllProjects operation...");

      // First get count of existing projects
      const [existingCount] = await db.select({ count: count() }).from(projects);
      console.log(`Found ${existingCount.count} projects to delete`);

      if (existingCount.count === 0) {
        console.log("No projects to delete");
        return;
      }

      // Get all project IDs for constraint checking
      const projectList = await db.select({projectId: projects.projectId}).from(projects);
      const projectIds = projectList.map((project) => project.projectId);
      console.log("Project IDs to check:", projectIds);

      // Check if any projects have associated purchase orders
      const [associatedPOs] = await db
        .select({ count: count() })
        .from(purchaseOrders)
        .where(inArray(purchaseOrders.projectId, projectIds));

      console.log(`Found ${associatedPOs.count} associated purchase orders`);

      if (associatedPOs.count > 0) {
        throw new Error(`Cannot delete projects because ${associatedPOs.count} project(s) have associated purchase orders. Please remove or reassign the purchase orders first.`);
      }

      // Check if any projects have associated invoice matches through purchase orders
      const associatedInvoiceMatches = await db
        .select({ count: count() })
        .from(invoicePoMatches)
        .innerJoin(purchaseOrders, eq(invoicePoMatches.poId, purchaseOrders.id))
        .where(inArray(purchaseOrders.projectId, projectIds));

      console.log(`Found ${associatedInvoiceMatches.length > 0 ? associatedInvoiceMatches[0].count : 0} associated invoice matches`);

      if (associatedInvoiceMatches.length > 0 && associatedInvoiceMatches[0].count > 0) {
        throw new Error(`Cannot delete projects because some have associated invoice-PO matches. Please resolve these matches first.`);
      }

      // Execute the delete operation
      console.log("Executing delete operation...");
      const result = await db.delete(projects).execute();
      console.log("Delete operation result:", result);

      // Verify deletion worked
      const [remainingCount] = await db.select({ count: count() }).from(projects);
      console.log(`Projects remaining after delete: ${remainingCount.count}`);

      if (remainingCount.count > 0) {
        throw new Error(`Delete operation failed. ${remainingCount.count} projects still remain.`);
      }

      console.log("All projects deleted successfully");
    } catch (error) {
      console.error("Error deleting all projects:", error);
      throw error;
    }
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

  async deletePurchaseOrder(id: number): Promise<void> {
    // Check if PO has associated invoice matches
    const [associatedMatches] = await db
      .select({ count: count() })
      .from(invoicePoMatches)
      .where(eq(invoicePoMatches.poId, id));

    if (associatedMatches.count > 0) {
      throw new Error(`Cannot delete purchase order because it has ${associatedMatches.count} associated invoice match(es). Please resolve these matches first.`);
    }

    await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
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
    const results = await db
      .select()
      .from(invoicePoMatches)
      .innerJoin(invoices, eq(invoicePoMatches.invoiceId, invoices.id))
      .innerJoin(purchaseOrders, eq(invoicePoMatches.poId, purchaseOrders.id))
      .where(eq(invoicePoMatches.status, 'unresolved'));

    return results.map(result => ({
      ...result.invoice_po_matches,
      invoice: result.invoices,
      purchaseOrder: result.purchase_orders,
    }));
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

  // Discrepancy detection operations
  async createInvoiceFlags(flags: InsertInvoiceFlag[]): Promise<InvoiceFlag[]> {
    if (flags.length === 0) return [];
    return await db.insert(invoiceFlags).values(flags).returning();
  }

  async getInvoiceFlags(invoiceId: number): Promise<InvoiceFlag[]> {
    return await db
      .select()
      .from(invoiceFlags)
      .where(eq(invoiceFlags.invoiceId, invoiceId))
      .orderBy(desc(invoiceFlags.createdAt));
  }

  async resolveInvoiceFlag(flagId: number, resolvedBy: string): Promise<InvoiceFlag> {
    const [flag] = await db
      .update(invoiceFlags)
      .set({
        isResolved: true,
        resolvedBy,
        resolvedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(invoiceFlags.id, flagId))
      .returning();
    return flag;
  }

  async getAllUnresolvedFlags(): Promise<(InvoiceFlag & { invoice: Invoice })[]> {
    const results = await db
      .select()
      .from(invoiceFlags)
      .leftJoin(invoices, eq(invoiceFlags.invoiceId, invoices.id))
      .where(eq(invoiceFlags.isResolved, false))
      .orderBy(desc(invoiceFlags.createdAt));

    return results.map(result => ({
      ...result.invoice_flags,
      invoice: result.invoices!
    }));
  }

  // Predictive alerts operations
  async createPredictiveAlerts(alerts: InsertPredictiveAlert[]): Promise<PredictiveAlert[]> {
    if (alerts.length === 0) return [];
    return await db.insert(predictiveAlerts).values(alerts).returning();
  }

  async getPredictiveAlerts(invoiceId: number): Promise<PredictiveAlert[]> {
    return await db
      .select()
      .from(predictiveAlerts)
      .where(eq(predictiveAlerts.invoiceId, invoiceId))
      .orderBy(desc(predictiveAlerts.createdAt));
  }

  async getTopIssuesThisMonth(): Promise<any[]> {
    const currentMonth = new Date();
    currentMonth.setDate(1);

    // Get actual flag data for this month
    const flagStats = await db
      .select({
        flagType: invoiceFlags.flagType,
        severity: invoiceFlags.severity,
        count: count()
      })
      .from(invoiceFlags)
      .where(gte(invoiceFlags.createdAt, currentMonth))
      .groupBy(invoiceFlags.flagType, invoiceFlags.severity)
      .orderBy(desc(count()));

    return flagStats.map(stat => ({
      issueType: stat.flagType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      count: stat.count,
      severity: stat.severity,
      trend: "0%" // Would need historical data for actual trends
    }));
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

  // Project matching operations
  async createInvoiceProjectMatch(match: InsertInvoiceProjectMatch): Promise<InvoiceProjectMatch> {
    const [created] = await db
      .insert(invoiceProjectMatches)
      .values(match)
      .returning();
    return created;
  }

  async updateInvoiceProjectMatch(id: number, updates: Partial<InsertInvoiceProjectMatch>): Promise<InvoiceProjectMatch> {
    const [updated] = await db
      .update(invoiceProjectMatches)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(invoiceProjectMatches.id, id))
      .returning();
    return updated;
  }

  async getInvoiceProjectMatches(invoiceId: number): Promise<(InvoiceProjectMatch & { project: Project })[]> {
    const matches = await db
      .select({
        id: invoiceProjectMatches.id,
        invoiceId: invoiceProjectMatches.invoiceId,
        projectId: invoiceProjectMatches.projectId,
        matchScore: invoiceProjectMatches.matchScore,
        status: invoiceProjectMatches.status,
        matchDetails: invoiceProjectMatches.matchDetails,
        isActive: invoiceProjectMatches.isActive,
        createdAt: invoiceProjectMatches.createdAt,
        updatedAt: invoiceProjectMatches.updatedAt,
        project: projects,
      })
      .from(invoiceProjectMatches)
      .innerJoin(projects, eq(invoiceProjectMatches.projectId, projects.projectId))
      .where(eq(invoiceProjectMatches.invoiceId, invoiceId))
      .orderBy(desc(invoiceProjectMatches.matchScore));

    return matches;
  }

  async getUnresolvedProjectMatches(): Promise<(InvoiceProjectMatch & { invoice: Invoice; project: Project })[]> {
    const matches = await db
      .select({
        id: invoiceProjectMatches.id,
        invoiceId: invoiceProjectMatches.invoiceId,
        projectId: invoiceProjectMatches.projectId,
        matchScore: invoiceProjectMatches.matchScore,
        status: invoiceProjectMatches.status,
        matchDetails: invoiceProjectMatches.matchDetails,
        isActive: invoiceProjectMatches.isActive,
        createdAt: invoiceProjectMatches.createdAt,
        updatedAt: invoiceProjectMatches.updatedAt,
        invoice: invoices,
        project: projects,
      })
      .from(invoiceProjectMatches)
      .innerJoin(invoices, eq(invoiceProjectMatches.invoiceId, invoices.id))
      .innerJoin(projects, eq(invoiceProjectMatches.projectId, projects.projectId))
      .where(eq(invoiceProjectMatches.status, "unresolved"))
      .orderBy(desc(invoiceProjectMatches.createdAt));

    return matches;
  }

  async findPotentialProjectMatches(invoice: Invoice): Promise<{
    project: Project;
    matchScore: number;
    matchDetails: any;
  }[]> {
    // Get all active projects
    const allProjects = await this.getProjects();

    // Use the project matcher service
    const { projectMatcher } = await import('./projectMatcher.js');
    const matches = await projectMatcher.matchInvoiceWithProjects(invoice, allProjects);

    return matches.map(match => ({
      project: match.project,
      matchScore: match.matchScore,
      matchDetails: match.matchDetails,
    }));
  }

  async setActiveProjectMatch(invoiceId: number, matchId: number): Promise<void> {
    await db.transaction(async (tx) => {
      // Deactivate all matches for this invoice
      await tx
        .update(invoiceProjectMatches)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(invoiceProjectMatches.invoiceId, invoiceId));

      // Activate the selected match
      await tx
        .update(invoiceProjectMatches)
        .set({ isActive: true, status: 'manual', updatedAt: new Date() })
        .where(eq(invoiceProjectMatches.id, matchId));
    });
  }

  async createApprovedInvoiceProject(data: InsertApprovedInvoiceProject): Promise<ApprovedInvoiceProject> {
    const [approvedMatch] = await db
      .insert(approvedInvoiceProject)
      .values(data)
      .returning();
    return approvedMatch;
  }

  // Verified invoice project operations
  async createVerifiedInvoiceProject(data: InsertVerifiedInvoiceProject): Promise<VerifiedInvoiceProject> {
    const [verifiedMatch] = await db
      .insert(verifiedInvoiceProject)
      .values(data)
      .returning();
    return verifiedMatch;
  }

  async getVerifiedInvoiceProjects(): Promise<(VerifiedInvoiceProject & { invoice: Invoice; project: Project })[]> {
    const verified = await db
      .select({
        id: verifiedInvoiceProject.id,
        invoiceId: verifiedInvoiceProject.invoiceId,
        projectId: verifiedInvoiceProject.projectId,
        matchScore: verifiedInvoiceProject.matchScore,
        matchDetails: verifiedInvoiceProject.matchDetails,
        approvedBy: verifiedInvoiceProject.approvedBy,
        approvedAt: verifiedInvoiceProject.approvedAt,
        verifiedAt: verifiedInvoiceProject.verifiedAt,
        originalMatchId: verifiedInvoiceProject.originalMatchId,
        originalApprovedId: verifiedInvoiceProject.originalApprovedId,
        validationResults: verifiedInvoiceProject.validationResults,
        createdAt: verifiedInvoiceProject.createdAt,
        invoice: invoices,
        project: projects,
      })
      .from(verifiedInvoiceProject)
      .innerJoin(invoices, eq(verifiedInvoiceProject.invoiceId, invoices.id))
      .innerJoin(projects, eq(verifiedInvoiceProject.projectId, projects.projectId))
      .orderBy(desc(verifiedInvoiceProject.verifiedAt));

    return verified;
  }

  async moveApprovedToVerified(approvedId: number, validationResults: any): Promise<VerifiedInvoiceProject> {
    return await db.transaction(async (tx) => {
      // Get the approved invoice project
      const [approved] = await tx
        .select()
        .from(approvedInvoiceProject)
        .where(eq(approvedInvoiceProject.id, approvedId));

      if (!approved) {
        throw new Error('Approved invoice project not found');
      }

      // Create verified invoice project record
      const [verified] = await tx
        .insert(verifiedInvoiceProject)
        .values({
          invoiceId: approved.invoiceId,
          projectId: approved.projectId,
          matchScore: approved.matchScore,
          matchDetails: approved.matchDetails,
          approvedBy: approved.approvedBy,
          approvedAt: approved.approvedAt || new Date(),
          originalMatchId: approved.originalMatchId,
          originalApprovedId: approved.id,
          validationResults: validationResults,
        })
        .returning();

      // Remove from approved table (invoice has been verified)
      await tx
        .delete(approvedInvoiceProject)
        .where(eq(approvedInvoiceProject.id, approvedId));

      return verified;
    });
  }

  async getApprovedInvoiceProjects(): Promise<(ApprovedInvoiceProject & { invoice: Invoice; project: Project })[]> {
    const approved = await db
      .select({
        id: approvedInvoiceProject.id,
        invoiceId: approvedInvoiceProject.invoiceId,
        projectId: approvedInvoiceProject.projectId,
        matchScore: approvedInvoiceProject.matchScore,
        matchDetails: approvedInvoiceProject.matchDetails,
        approvedBy: approvedInvoiceProject.approvedBy,
        approvedAt: approvedInvoiceProject.approvedAt,
        originalMatchId: approvedInvoiceProject.originalMatchId,
        createdAt: approvedInvoiceProject.createdAt,
        invoice: invoices,
        project: projects,
      })
      .from(approvedInvoiceProject)
      .innerJoin(invoices, eq(approvedInvoiceProject.invoiceId, invoices.id))
      .innerJoin(projects, eq(approvedInvoiceProject.projectId, projects.projectId))
      .orderBy(desc(approvedInvoiceProject.approvedAt));

    return approved;
  }

  async getApprovedInvoiceProjectByInvoiceId(invoiceId: number): Promise<(ApprovedInvoiceProject & { project: Project }) | null> {
    const [approved] = await db
      .select({
        id: approvedInvoiceProject.id,
        invoiceId: approvedInvoiceProject.invoiceId,
        projectId: approvedInvoiceProject.projectId,
        matchScore: approvedInvoiceProject.matchScore,
        matchDetails: approvedInvoiceProject.matchDetails,
        approvedBy: approvedInvoiceProject.approvedBy,
        approvedAt: approvedInvoiceProject.approvedAt,
        originalMatchId: approvedInvoiceProject.originalMatchId,
        createdAt: approvedInvoiceProject.createdAt,
        project: projects,
      })
      .from(approvedInvoiceProject)
      .innerJoin(projects, eq(approvedInvoiceProject.projectId, projects.projectId))
      .where(eq(approvedInvoiceProject.invoiceId, invoiceId))
      .limit(1);

    return approved || null;
  }

    // Feedback log methods
  async createFeedbackLog(feedbackData: InsertFeedbackLog) {
    const [feedbackLog] = await db
      .insert(feedbackLogs)
      .values(feedbackData)
      .returning();
    return feedbackLog;
  }

  async getFeedbackLogs(limit?: number) {
    const query = db
      .select({
        id: feedbackLogs.id,
        invoiceId: feedbackLogs.invoiceId,
        userId: feedbackLogs.userId,
        fileName: feedbackLogs.fileName,
        reason: feedbackLogs.reason,
        createdAt: feedbackLogs.createdAt,
      })
      .from(feedbackLogs)
      .orderBy(desc(feedbackLogs.createdAt));

    if (limit) {
      query.limit(limit);
    }

    return await query;
  }

  async getFeedbackLog(id: number) {
    const [feedbackLog] = await db
      .select()
      .from(feedbackLogs)
      .where(eq(feedbackLogs.id, id));
    return feedbackLog;
  }

  // Learning tracking methods
  async getFeedbackLogsInTimeframe(startDate: Date) {
    return await db
      .select()
      .from(feedbackLogs)
      .where(gte(feedbackLogs.createdAt, startDate));
  }

  async getExtractionsInTimeframe(startDate: Date) {
    const result = await db
      .select({ count: count() })
      .from(invoices)
      .where(
        and(
          gte(invoices.createdAt, startDate),
          eq(invoices.status, "extracted")
        )
      );

    return result[0]?.count || 0;
  }

  async getRecentFeedbackLogs(days: number) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return await db
      .select()
      .from(feedbackLogs)
      .where(gte(feedbackLogs.createdAt, startDate))
      .orderBy(desc(feedbackLogs.createdAt));
  }

  async getFeedbackLogsInRange(olderThanDays: number, newerThanDays: number) {
    const olderDate = new Date();
    olderDate.setDate(olderDate.getDate() - olderThanDays);

    const newerDate = new Date();
    newerDate.setDate(newerDate.getDate() - newerThanDays);

    return await db
      .select()
      .from(feedbackLogs)
      .where(
        and(
          gte(feedbackLogs.createdAt, olderDate),
          lte(feedbackLogs.createdAt, newerDate)
        )
      );
  }

  async getExtractionsForDate(date: Date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const result = await db
      .select({ count: count() })
      .from(invoices)
      .where(
        and(
          gte(invoices.createdAt, startOfDay),
          lte(invoices.createdAt, endOfDay),
          eq(invoices.status, "extracted")
        )
      );

    return result[0]?.count || 0;
  }

  async getFeedbackLogsForDate(date: Date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return await db
      .select()
      .from(feedbackLogs)
      .where(
        and(
          gte(feedbackLogs.createdAt, startOfDay),
          lte(feedbackLogs.createdAt, endOfDay)
        )
      );
  }

  async getTotalFeedbackCount() {
    const result = await db
      .select({ count: count() })
      .from(feedbackLogs);

    return result[0]?.count || 0;
  }

  // Classification methods
  async getClassificationKeywords(userId?: string): Promise<Record<string, { id: number; keyword: string; isDefault: boolean }[]>> {
    const conditions = [];

    if (userId) {
      conditions.push(
        or(
          eq(classificationKeywords.isDefault, true),
          eq(classificationKeywords.userId, userId)
        )
      );
    } else {
      conditions.push(eq(classificationKeywords.isDefault, true));
    }

    const keywords = await db
      .select()
      .from(classificationKeywords)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const grouped: Record<string, { id: number; keyword: string; isDefault: boolean }[]> = {
      consumable_materials: [],
      non_consumable_materials: [],
      labor: [],
      tools_equipment: []
    };

    for (const keyword of keywords) {
      grouped[keyword.category].push({
        id: keyword.id,
        keyword: keyword.keyword,
        isDefault: keyword.isDefault || false
      });
    }

    return grouped;
  }

  async addClassificationKeyword(data: InsertClassificationKeyword): Promise<any> {
    const result = await db
      .insert(classificationKeywords)
      .values(data)
      .returning();
    return result[0];
  }

  async removeClassificationKeyword(keywordId: number, userId: string): Promise<void> {
    await db
      .delete(classificationKeywords)
      .where(
        and(
          eq(classificationKeywords.id, keywordId),
          eq(classificationKeywords.userId, userId),
          eq(classificationKeywords.isDefault, false)
        )
      );
  }

  async getLineItemClassifications(invoiceId: number): Promise<any[]> {
    const result = await db
      .select({
        lineItemId: lineItems.id,
        description: lineItems.description,
        quantity: lineItems.quantity,
        unitPrice: lineItems.unitPrice,
        totalPrice: lineItems.totalPrice,
        category: lineItemClassifications.category,
        matchedKeyword: lineItemClassifications.matchedKeyword,
        confidence: lineItemClassifications.confidence,
        isManualOverride: lineItemClassifications.isManualOverride,
        classificationId: lineItemClassifications.id,
      })
      .from(lineItems)
      .leftJoin(lineItemClassifications, eq(lineItems.id, lineItemClassifications.lineItemId))
      .where(eq(lineItems.invoiceId, invoiceId));

    return result;
  }

  async updateLineItemClassification(lineItemId: number, category: string, userId: string): Promise<void> {
    const existingClassification = await db
      .select()
      .from(lineItemClassifications)
      .where(eq(lineItemClassifications.lineItemId, lineItemId))
      .limit(1);

    if (existingClassification.length > 0) {
      await db
        .update(lineItemClassifications)
        .set({
          category: category as any,
          isManualOverride: true,
          matchedKeyword: 'manual override',
          confidence: '1.00',
          classifiedAt: new Date(),
          classifiedBy: userId
        })
        .where(eq(lineItemClassifications.lineItemId, lineItemId));
    } else {
      await db.insert(lineItemClassifications).values({
        lineItemId,
        category: category as any,
        isManualOverride: true,
        matchedKeyword: 'manual override',
        confidence: '1.00',
        classifiedBy: userId
      });
    }
  }
}

export const storage = new DatabaseStorage();