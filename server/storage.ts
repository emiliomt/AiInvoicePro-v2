import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";

import {
  users,
  invoices,
  lineItems,
  approvals,
  purchaseOrders,
  invoicePoMatches,
  invoiceProjectMatches,
  projects,
  approvedInvoiceProject,
  verifiedInvoiceProject,
  validationRules,
  invoiceFlags,
  predictiveAlerts,
  feedbackLogs,
  classificationKeywords,
  lineItemClassifications,

  erpConnections,
  erpTasks,
  savedWorkflows,
  scheduledTasks,
  invoiceImporterConfigs,
  invoiceImporterLogs,
  importedInvoices,
  settings,
  pettyCashLog,
  companies,
  // Types
  type Invoice,
  type InsertInvoice,
  type LineItem,
  type InsertLineItem,
  type Approval,
  type InsertApproval,
  type Company,
  type InsertCompany,
  type User,
  type UpsertUser,
  type Project,
  type InsertProject,
  type PurchaseOrder,
  type InsertPurchaseOrder,
  type InvoicePoMatch,
  type InsertInvoicePoMatch,
  type InvoiceProjectMatch,
  type InsertInvoiceProjectMatch,
  type ErpConnection,
  type InsertErpConnection,
  type InvoiceImporterConfig,
  type InsertInvoiceImporterConfig,
  type InvoiceImporterLog,
  type InsertInvoiceImporterLog,
  type ImportedInvoice,
  type InsertImportedInvoice,
  type ErpTask,
  type InsertErpTask,
  type SavedWorkflow,
  type InsertSavedWorkflow,
  type ScheduledTask,
  type InsertScheduledTask
} from "@shared/schema";
import { eq, desc, sql, and, or, ilike, isNull, inArray, getTableColumns, gte } from "drizzle-orm";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const client = neon(process.env.DATABASE_URL);
const db = drizzle(client);

export interface IStorage {
  // Companies
  createCompany(company: InsertCompany): Promise<Company>;
  getCompany(id: number): Promise<Company | null>;
  getCompanies(): Promise<Company[]>;
  updateCompany(id: number, updates: Partial<InsertCompany>): Promise<void>;

  // Dashboard and stats
  getDashboardStats(userId?: string): Promise<any>;
  getPendingApprovals(): Promise<any[]>;
  getTopIssuesThisMonth(): Promise<any[]>;
  deleteAllUserInvoices(userId: string): Promise<number>;
  deleteAllCompanyInvoices(companyId: number): Promise<number>;

  // Petty Cash
  createPettyCashLog(log: any): Promise<any>;
  updatePettyCashLog(id: number, updates: any): Promise<any>;
  getPettyCashLogs(status?: string): Promise<any[]>;
  getPettyCashLogByInvoiceId(invoiceId: number): Promise<any>;
  isPettyCashInvoice(invoiceId: number): Promise<boolean>;

  // Settings
  getSetting(key: string): Promise<any>;
  updateSetting(key: string, value: string): Promise<any>;
  setSetting(setting: { key: string; value: string; description: string }): Promise<any>;

  // Learning and feedback
  getTotalFeedbackCount(): Promise<number>;
  getLearningInsights(type?: string): Promise<any[]>;
  storeLearningInsight(insight: any): Promise<void>;
  createFeedbackLog(log: any): Promise<any>;
  getFeedbackLogs(limit?: number): Promise<any[]>;
  getFeedbackLog(id: number): Promise<any>;

  // Additional methods
  getInvoicesWithProjectMatches(userId: string): Promise<any[]>;
  getCompanyInvoicesWithProjectMatches(companyId: number): Promise<any[]>;
  getValidationRules(): Promise<any[]>;
  getValidationRule(id: number): Promise<any>;
  createValidationRule(rule: any): Promise<any>;
  updateValidationRule(id: number, updates: any): Promise<any>;
  deleteValidationRule(id: number): Promise<void>;
  validateInvoiceData(invoiceData: any): Promise<any>;
  validateAllApprovedInvoices(): Promise<any>;

  // Invoice Importer methods
  createInvoiceImporterConfig(config: InsertInvoiceImporterConfig): Promise<InvoiceImporterConfig>;
  getInvoiceImporterConfigs(): Promise<InvoiceImporterConfig[]>;
  getInvoiceImporterConfigsByUser(userId: string): Promise<InvoiceImporterConfig[]>;
  getInvoiceImporterConfig(id: number): Promise<InvoiceImporterConfig | null>;
  updateInvoiceImporterConfig(id: number, updates: Partial<InsertInvoiceImporterConfig>): Promise<void>;
  deleteInvoiceImporterConfig(id: number): Promise<void>;
  deleteInvoiceImporterConfigCascade(configId: number): Promise<void>;
  cleanupInactiveConfigurations(): Promise<void>;
  createInvoiceImporterLog(log: InsertInvoiceImporterLog): Promise<InvoiceImporterLog>;
  getInvoiceImporterLogs(): Promise<InvoiceImporterLog[]>;
  getInvoiceImporterLogsByConfig(configId: number): Promise<InvoiceImporterLog[]>;
  getInvoiceImporterLog(id: number): Promise<InvoiceImporterLog | null>;
  getLatestInvoiceImporterLog(configId: number): Promise<InvoiceImporterLog | null>;
  updateInvoiceImporterLog(id: number, updates: Partial<InsertInvoiceImporterLog>): Promise<void>;
  deleteInvoiceImporterLog(id: number): Promise<void>;

  // Missing methods from routes
  deleteAllProjects(): Promise<void>;
  getPurchaseOrderByPoId(poId: string): Promise<PurchaseOrder | null>;
  getAllPurchaseOrders(): Promise<PurchaseOrder[]>;
  getInvoicePoMatches(): Promise<any[]>;
  assignProjectToInvoice(invoiceId: number, projectId: string): Promise<void>;
  updateInvoicePoMatch(id: number, updates: any): Promise<any>;
  getUnresolvedMatches(): Promise<any[]>;
  getInvoiceProjectMatches(): Promise<any[]>;
  findPotentialProjectMatches(invoice: any): Promise<any[]>;
  updateInvoiceProjectMatch(id: number, updates: any): Promise<any>;
  setActiveProjectMatch(invoiceId: number, projectId: number): Promise<void>;
  getUnresolvedProjectMatches(): Promise<any[]>;
  getInvoiceFlags(): Promise<any[]>;
  resolveInvoiceFlag(id: number): Promise<void>;
  getPredictiveAlerts(): Promise<any[]>;
  getClassificationKeywords(): Promise<any[]>;
  addClassificationKeyword(keyword: any): Promise<any>;
  removeClassificationKeyword(keywordId: number, userId?: string): Promise<void>;
  getLineItemClassifications(invoiceId: number): Promise<any[]>;
  updateLineItemClassification(lineItemId: number, category: string, userId: string): Promise<void>;
  createApprovedInvoiceProject(data: any): Promise<any>;
  getApprovedInvoiceProjects(): Promise<any[]>;
  getVerifiedInvoiceProjects(): Promise<any[]>;
  getInvoicePoMatchesWithDetails(): Promise<any[]>;
  moveApprovedToVerified(id: number): Promise<void>;
  getInvoiceImporterLog(id: number): Promise<any>;
  getLatestInvoiceImporterLog(configId: number): Promise<any>;
  updateInvoiceImporterLog(id: number, updates: any): Promise<void>;
  getImportedInvoicesByLog(logId: number): Promise<any[]>;
  updateImportedInvoice(id: number, updates: any): Promise<void>;
  getInvoiceImporterLogs(configId?: number): Promise<any[]>;
  getImportLogsWithDetails(): Promise<any[]>;
  getUsersByCompany(companyId: number): Promise<User[]>;

  // Users  
  upsertUser(user: UpsertUser): Promise<User>;
  getUser(id: string): Promise<User | null>;
  getUsers(): Promise<User[]>;

  // Invoices
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  getInvoice(id: number): Promise<Invoice | null>;
  getInvoices(): Promise<Invoice[]>;
  updateInvoice(id: number, updates: Partial<InsertInvoice>): Promise<void>;
  deleteInvoice(id: number): Promise<void>;
  getInvoicesByUserId(userId: string): Promise<Invoice[]>;
  getInvoicesByCompanyId(companyId: number): Promise<Invoice[]>;
  getInvoicesByIds(invoiceIds: number[]): Promise<Invoice[]>;
  getInvoicesByFileName(baseFileName: string): Promise<Invoice[]>;

  // Line Items
  createLineItem(lineItem: InsertLineItem): Promise<LineItem>;
  getLineItemsByInvoiceId(invoiceId: number): Promise<LineItem[]>;
  deleteLineItemsByInvoiceId(invoiceId: number): Promise<void>;

  // Approvals
  createApproval(approval: InsertApproval): Promise<Approval>;
  getApprovalsByInvoiceId(invoiceId: number): Promise<Approval[]>;

  // Projects
  createProject(project: InsertProject): Promise<Project>;
  getProject(id: number): Promise<Project | null>;
  getProjects(): Promise<Project[]>;
  getProjectsByCompanyId(companyId: number): Promise<Project[]>;
  updateProject(id: number, updates: Partial<InsertProject>): Promise<void>;
  deleteProject(id: number): Promise<void>;
  upsertProjectByProjectId(projectId: string, project: Omit<InsertProject, 'projectId'>): Promise<Project>;

  // Purchase Orders
  createPurchaseOrder(po: InsertPurchaseOrder): Promise<PurchaseOrder>;
  getPurchaseOrder(id: number): Promise<PurchaseOrder | null>;
  getPurchaseOrders(): Promise<PurchaseOrder[]>;
  getPurchaseOrdersByCompanyId(companyId: number): Promise<PurchaseOrder[]>;
  updatePurchaseOrder(id: number, updates: Partial<InsertPurchaseOrder>): Promise<void>;
  deletePurchaseOrder(id: number): Promise<void>;
  upsertPurchaseOrderByPoId(poId: string, po: Omit<InsertPurchaseOrder, 'poId'>): Promise<PurchaseOrder>;

  // Invoice-PO Matches
  createInvoicePoMatch(match: InsertInvoicePoMatch): Promise<InvoicePoMatch>;
  getInvoicePoMatchesByInvoiceId(invoiceId: number): Promise<InvoicePoMatch[]>;

  // Invoice-Project Matches
  createInvoiceProjectMatch(match: InsertInvoiceProjectMatch): Promise<InvoiceProjectMatch>;
  getInvoiceProjectMatchesByInvoiceId(invoiceId: number): Promise<InvoiceProjectMatch[]>;

  // ERP Connections
  createErpConnection(connection: InsertErpConnection): Promise<ErpConnection>;
  getErpConnection(id: number): Promise<ErpConnection | null>;
  getErpConnections(): Promise<ErpConnection[]>;
  updateErpConnection(id: number, updates: Partial<InsertErpConnection>): Promise<void>;
  deleteErpConnection(id: number): Promise<void>;
  syncErpCredentialsToImportConfigs(connectionId: number, credentials: {
    erpUrl: string;
    erpUsername: string;
    erpPassword: string;
  }): Promise<void>;

  // Invoice Importer
  createInvoiceImporterConfig(config: InsertInvoiceImporterConfig): Promise<InvoiceImporterConfig>;
  getInvoiceImporterConfigs(): Promise<InvoiceImporterConfig[]>;
  getInvoiceImporterConfigsByUser(userId: string): Promise<InvoiceImporterConfig[]>;
  getInvoiceImporterConfig(id: number): Promise<InvoiceImporterConfig | null>;
  updateInvoiceImporterConfig(id: number, updates: Partial<InsertInvoiceImporterConfig>): Promise<void>;
  deleteInvoiceImporterConfig(id: number): Promise<void>;
  deleteInvoiceImporterConfigCascade(id: number): Promise<void>;

  createInvoiceImporterLog(log: InsertInvoiceImporterLog): Promise<InvoiceImporterLog>;
  getInvoiceImporterLogs(): Promise<InvoiceImporterLog[]>;

  createImportedInvoice(invoice: InsertImportedInvoice): Promise<ImportedInvoice>;
  getImportedInvoices(): Promise<ImportedInvoice[]>;

  // ERP Tasks
  createErpTask(task: InsertErpTask): Promise<ErpTask>;
  getErpTask(id: number): Promise<ErpTask | null>;
  getErpTasks(): Promise<ErpTask[]>;
  updateErpTask(id: number, updates: Partial<InsertErpTask>): Promise<void>;
  deleteErpTask(id: number): Promise<void>;

  // Saved Workflows
  createSavedWorkflow(workflow: InsertSavedWorkflow): Promise<SavedWorkflow>;
  getSavedWorkflow(id: number): Promise<SavedWorkflow | null>;
  getSavedWorkflows(): Promise<SavedWorkflow[]>;
  updateSavedWorkflow(id: number, updates: Partial<InsertSavedWorkflow>): Promise<void>;
  deleteSavedWorkflow(id: number): Promise<void>;

  // Scheduled Tasks
  createScheduledTask(task: InsertScheduledTask): Promise<ScheduledTask>;
  getScheduledTask(id: number): Promise<ScheduledTask | null>;
  getScheduledTasks(): Promise<ScheduledTask[]>;
  updateScheduledTask(id: number, updates: Partial<InsertScheduledTask>): Promise<void>;
  deleteScheduledTask(id: number): Promise<void>;
}

class PostgresStorage implements IStorage {
  // Companies
  async createCompany(company: InsertCompany): Promise<Company> {
    const [result] = await db.insert(companies).values(company).returning();
    return result;
  }

  async getCompany(id: number): Promise<Company | null> {
    const [result] = await db.select().from(companies).where(eq(companies.id, id));
    return result || null;
  }

  async getCompanies(): Promise<Company[]> {
    return await db.select().from(companies).orderBy(desc(companies.createdAt));
  }

  async updateCompany(id: number, updates: Partial<InsertCompany>): Promise<void> {
    await db.update(companies).set({
      ...updates,
      updatedAt: new Date()
    }).where(eq(companies.id, id));
  }

  // Users
  async upsertUser(user: UpsertUser): Promise<User> {
    const [result] = await db.insert(users).values(user)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: user.email,
          updatedAt: new Date()
        }
      }).returning();
    return result;
  }

  async getUser(id: string): Promise<User | null> {
    const [result] = await db.select().from(users).where(eq(users.id, id));
    return result || null;
  }

  async getUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  // Invoices
  async createInvoice(invoice: InsertInvoice): Promise<Invoice> {
    const [result] = await db.insert(invoices).values(invoice).returning();
    return result;
  }

  async getInvoice(id: number): Promise<Invoice | null> {
    const [result] = await db.select().from(invoices).where(eq(invoices.id, id));
    return result || null;
  }

  async getInvoices(): Promise<Invoice[]> {
    // Join with imported_invoices to get isDataSource information for RPA imports
    const results = await db
      .select({
        ...getTableColumns(invoices),
        isDataSource: importedInvoices.isDataSource,
      })
      .from(invoices)
      .leftJoin(importedInvoices, eq(invoices.id, importedInvoices.invoiceId))
      .orderBy(desc(invoices.createdAt));

    return results.map(result => ({
      ...result,
      isDataSource: result.isDataSource ?? null, // Convert undefined to null for consistency
    }));
  }

  async getAllInvoices(): Promise<Invoice[]> {
    return await db.select().from(invoices).orderBy(desc(invoices.createdAt));
  }

  async updateInvoice(id: number, updates: Partial<InsertInvoice>): Promise<void> {
    try {
      console.log(`[STORAGE] Updating invoice ${id} with:`, updates);

      const result = await db
        .update(invoices)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(invoices.id, id))
        .returning();

      if (result.length === 0) {
        throw new Error(`Invoice ${id} not found for update`);
      }

      console.log(`[STORAGE] Invoice ${id} updated successfully:`, {
        totalAmount: result[0].totalAmount,
        currency: result[0].currency,
        vendorName: result[0].vendorName
      });
    } catch (error) {
      console.error(`[STORAGE] Error updating invoice ${id}:`, error);
      throw error;
    }
  }

  async deleteInvoice(id: number): Promise<void> {
    // Delete linked imported invoice files first (for RPA invoices)
    const { Client } = await import('pg');
    const dbClient = new Client({
      connectionString: process.env.DATABASE_URL,
    });

    try {
      await dbClient.connect();

      // First, get the linked files so we can delete the physical files
      const linkedFilesQuery = `
        SELECT file_path, original_file_name 
        FROM imported_invoices 
        WHERE linked_invoice_id = $1
      `;
      const linkedFiles = await dbClient.query(linkedFilesQuery, [id]);

      // Delete physical files from disk
      const fs = await import('fs');
      for (const file of linkedFiles.rows) {
        try {
          if (fs.existsSync(file.file_path)) {
            fs.unlinkSync(file.file_path);
            console.log(`🗑️ Deleted physical file: ${file.file_path}`);
          }
        } catch (fileError) {
          console.error(`Error deleting physical file ${file.file_path}:`, fileError);
        }
      }

      // Delete linked PDF files from imported_invoices table
      const deleteResult = await dbClient.query(
        'DELETE FROM imported_invoices WHERE linked_invoice_id = $1',
        [id]
      );

      console.log(`🗑️ Deleted ${deleteResult.rowCount} linked imported files for invoice ${id}`);

    } catch (error) {
      console.error(`Error deleting linked files for invoice ${id}:`, error);
    } finally {
      await dbClient.end();
    }

    // Delete related line items
    await db.delete(lineItems).where(eq(lineItems.invoiceId, id));
    // Delete feedback logs
    await db.delete(feedbackLogs).where(eq(feedbackLogs.invoiceId, id));
    // Delete approvals
    await db.delete(approvals).where(eq(approvals.invoiceId, id));
    // Delete invoice-PO matches
    await db.delete(invoicePoMatches).where(eq(invoicePoMatches.invoiceId, id));
    // Delete invoice-project matches
    await db.delete(invoiceProjectMatches).where(eq(invoiceProjectMatches.invoiceId, id));
    // Finally delete the main invoice
    await db.delete(invoices).where(eq(invoices.id, id));

    console.log(`✅ Successfully deleted invoice ${id} and all related records`);
  }

  async getInvoicesByUserId(userId: string): Promise<Invoice[]> {
    // Get user's company to include RPA invoices for the same company
    const user = await this.getUser(userId);
    if (!user || !user.companyId) {
      // If no company, only return user's own invoices
      return await db.select().from(invoices)
        .where(eq(invoices.userId, userId))
        .orderBy(desc(invoices.createdAt));
    }

    // Include both user's invoices and RPA invoices for the company
    return await db.select().from(invoices)
      .where(
        or(
          eq(invoices.userId, userId),
          and(
            eq(invoices.userId, 'rpa-system'),
            eq(invoices.companyId, user.companyId)
          )
        )
      )
      .orderBy(desc(invoices.createdAt));
  }

  async getInvoicesByCompanyId(companyId: number): Promise<Invoice[]> {
    return await db.select().from(invoices)
      .where(eq(invoices.companyId, companyId))
      .orderBy(desc(invoices.createdAt));
  }

  async getInvoicesByIds(invoiceIds: number[]): Promise<Invoice[]> {
    return await db.select().from(invoices).where(inArray(invoices.id, invoiceIds));
  }

  async getInvoicesByFileName(baseFileName: string): Promise<Invoice[]> {
    // Search for invoices with filenames that match the base name (with or without extension)
    return await db.select().from(invoices)
      .where(
        or(
          ilike(invoices.fileName, `${baseFileName}.%`),
          eq(invoices.fileName, baseFileName)
        )
      )
      .orderBy(desc(invoices.createdAt));
  }

  // Line Items
  async createLineItem(lineItem: InsertLineItem): Promise<LineItem> {
    const [result] = await db.insert(lineItems).values(lineItem).returning();
    return result;
  }

  async getLineItemsByInvoiceId(invoiceId: number): Promise<LineItem[]> {
    return await db.select().from(lineItems).where(eq(lineItems.invoiceId, invoiceId));
  }

  async deleteLineItemsByInvoiceId(invoiceId: number): Promise<void> {
    await db.delete(lineItems).where(eq(lineItems.invoiceId, invoiceId));
  }

  // Approvals
  async createApproval(approval: InsertApproval): Promise<Approval> {
    const [result] = await db.insert(approvals).values(approval).returning();
    return result;
  }

  async getApprovalsByInvoiceId(invoiceId: number): Promise<Approval[]> {
    return await db.select().from(approvals).where(eq(approvals.invoiceId, invoiceId));
  }

  // Projects
  async createProject(project: InsertProject): Promise<Project> {
    const [result] = await db.insert(projects).values(project).returning();
    return result;
  }

  async getProject(id: number): Promise<Project | null> {
    const [result] = await db.select().from(projects).where(eq(projects.id, id));
    return result || null;
  }

  async getProjects(): Promise<Project[]> {
    return await db.select().from(projects).orderBy(desc(projects.createdAt));
  }

  async getProjectsByCompanyId(companyId: number): Promise<Project[]> {
    return await db.select().from(projects)
      .where(eq(projects.companyId, companyId))
      .orderBy(desc(projects.createdAt));
  }

  async updateProject(id: number, updates: Partial<InsertProject>): Promise<void> {
    await db.update(projects).set({
      ...updates,
      updatedAt: new Date()
    }).where(eq(projects.id, id));
  }

  async deleteProject(id: number): Promise<void> {
    await db.delete(projects).where(eq(projects.id, id));
  }

  async upsertProjectByProjectId(projectId: string, project: Omit<InsertProject, 'projectId'>): Promise<Project> {
    const [result] = await db.insert(projects).values({ ...project, projectId })
      .onConflictDoUpdate({
        target: projects.projectId,
        set: {
          ...project,
          updatedAt: new Date()
        }
      }).returning();
    return result;
  }

  // Purchase Orders
  async createPurchaseOrder(po: InsertPurchaseOrder): Promise<PurchaseOrder> {
    const [result] = await db.insert(purchaseOrders).values(po).returning();
    return result;
  }

  async getPurchaseOrder(id: number): Promise<PurchaseOrder | null> {
    const [result] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
    return result || null;
  }

  async getPurchaseOrders(): Promise<PurchaseOrder[]> {
    return await db.select().from(purchaseOrders).orderBy(desc(purchaseOrders.createdAt));
  }

  async getPurchaseOrdersByCompanyId(companyId: number): Promise<PurchaseOrder[]> {
    return await db.select().from(purchaseOrders)
      .where(eq(purchaseOrders.companyId, companyId))
      .orderBy(desc(purchaseOrders.createdAt));
  }

  async updatePurchaseOrder(id: number, updates: Partial<InsertPurchaseOrder>): Promise<void> {
    await db.update(purchaseOrders).set({
      ...updates,
      updatedAt: new Date()
    }).where(eq(purchaseOrders.id, id));
  }

  async deletePurchaseOrder(id: number): Promise<void> {
    await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
  }

  async upsertPurchaseOrderByPoId(poId: string, po: Omit<InsertPurchaseOrder, 'poId'>): Promise<PurchaseOrder> {
    const [result] = await db.insert(purchaseOrders).values({ ...po, poId })
      .onConflictDoUpdate({
        target: purchaseOrders.poId,
        set: {
          ...po,
          updatedAt: new Date()
        }
      }).returning();
    return result;
  }

  // Invoice-PO Matches
  async createInvoicePoMatch(match: InsertInvoicePoMatch): Promise<InvoicePoMatch> {
    const [result] = await db.insert(invoicePoMatches).values(match).returning();
    return result;
  }

  async getInvoicePoMatchesByInvoiceId(invoiceId: number): Promise<InvoicePoMatch[]> {
    return await db.select().from(invoicePoMatches).where(eq(invoicePoMatches.invoiceId, invoiceId));
  }

  // Invoice-Project Matches
  async createInvoiceProjectMatch(match: InsertInvoiceProjectMatch): Promise<InvoiceProjectMatch> {
    const [result] = await db.insert(invoiceProjectMatches).values(match).returning();
    return result;
  }

  async getInvoiceProjectMatchesByInvoiceId(invoiceId: number): Promise<InvoiceProjectMatch[]> {
    return await db.select().from(invoiceProjectMatches).where(eq(invoiceProjectMatches.invoiceId, invoiceId));
  }

  // ERP Connections
  async createErpConnection(connection: InsertErpConnection): Promise<ErpConnection> {
    const [result] = await db.insert(erpConnections).values(connection).returning();
    return result;
  }

  async getErpConnection(id: number): Promise<ErpConnection | null> {
    const [result] = await db.select().from(erpConnections).where(eq(erpConnections.id, id));
    return result || null;
  }

  async getErpConnections(userId?: string): Promise<ErpConnection[]> {
    if (userId) {
      return await db.select().from(erpConnections)
        .where(eq(erpConnections.userId, userId))
        .orderBy(desc(erpConnections.createdAt));
    }
    return await db.select().from(erpConnections).orderBy(desc(erpConnections.createdAt));
  }

  async updateErpConnection(id: number, updates: Partial<InsertErpConnection>): Promise<void> {
    await db.update(erpConnections).set({
      ...updates,
      updatedAt: new Date()
    }).where(eq(erpConnections.id, id));
  }

  async deleteErpConnection(id: number): Promise<void> {
    await db.delete(erpConnections).where(eq(erpConnections.id, id));
  }

  async syncErpCredentialsToImportConfigs(connectionId: number, credentials: {
    erpUrl: string;
    erpUsername: string;
    erpPassword: string;
  }): Promise<void> {
    // Update all invoice import configurations that reference this ERP connection
    await db.update(invoiceImporterConfigs).set({
      erpUrl: credentials.erpUrl,
      erpUsername: credentials.erpUsername,
      erpPassword: credentials.erpPassword,
      updatedAt: new Date()
    }).where(eq(invoiceImporterConfigs.connectionId, connectionId));
  }

  // Invoice Importer
  async createInvoiceImporterConfig(config: InsertInvoiceImporterConfig): Promise<InvoiceImporterConfig> {
    const [result] = await db.insert(invoiceImporterConfigs).values(config).returning();
    return result;
  }

  async getInvoiceImporterConfigs(): Promise<InvoiceImporterConfig[]> {
    return await db.select().from(invoiceImporterConfigs).orderBy(desc(invoiceImporterConfigs.createdAt));
  }

  async getInvoiceImporterConfigsByUser(userId: string): Promise<InvoiceImporterConfig[]> {
    return await db.select().from(invoiceImporterConfigs)
      .where(eq(invoiceImporterConfigs.userId, userId))
      .orderBy(desc(invoiceImporterConfigs.createdAt));
  }

  async getInvoiceImporterConfig(id: number): Promise<InvoiceImporterConfig | null> {
    const [result] = await db.select().from(invoiceImporterConfigs).where(eq(invoiceImporterConfigs.id, id));
    return result || null;
  }

  async updateInvoiceImporterConfig(id: number, updates: Partial<InsertInvoiceImporterConfig>): Promise<void> {
    await db.update(invoiceImporterConfigs).set({
      ...updates,
      updatedAt: new Date()
    }).where(eq(invoiceImporterConfigs.id, id));
  }

  async deleteInvoiceImporterConfig(id: number): Promise<void> {
    await db.delete(invoiceImporterConfigs).where(eq(invoiceImporterConfigs.id, id));
  }

  async deleteInvoiceImporterConfigCascade(configId: number): Promise<void> {
    try {
      // First delete all imported invoices for logs related to this config
      const logs = await db.select({ id: invoiceImporterLogs.id })
        .from(invoiceImporterLogs)
        .where(eq(invoiceImporterLogs.configId, configId));

      for (const log of logs) {
        await db.delete(importedInvoices).where(eq(importedInvoices.logId, log.id));
      }

      // Then delete all logs for this config
      await db.delete(invoiceImporterLogs).where(eq(invoiceImporterLogs.configId, configId));

      // Finally delete the config itself
      await db.delete(invoiceImporterConfigs).where(eq(invoiceImporterConfigs.id, configId));
    } catch (error) {
      console.error('Error in cascading delete:', error);
      throw error;
    }
  }

  async cleanupInactiveConfigurations(): Promise<void> {
    try {
      // Get all inactive configurations older than 1 day that shouldn't be in schedules
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const inactiveConfigs = await db.select({ id: invoiceImporterConfigs.id })
        .from(invoiceImporterConfigs)
        .where(
          and(
            eq(invoiceImporterConfigs.isActive, false),
            sql`${invoiceImporterConfigs.createdAt} < ${oneDayAgo}`
          )
        );

      // Delete inactive configurations with cascade
      for (const config of inactiveConfigs) {
        await this.deleteInvoiceImporterConfigCascade(config.id);
      }

      console.log(`Cleaned up ${inactiveConfigs.length} inactive configurations`);
    } catch (error) {
      console.error('Error cleaning up inactive configurations:', error);
      // Don't throw error to prevent API failure
    }
  }

  async createInvoiceImporterLog(log: InsertInvoiceImporterLog): Promise<InvoiceImporterLog> {
    const [result] = await db.insert(invoiceImporterLogs).values(log).returning();
    return result;
  }

  async getInvoiceImporterLogs(): Promise<InvoiceImporterLog[]> {
    return await db.select().from(invoiceImporterLogs).orderBy(desc(invoiceImporterLogs.createdAt));
  }

  async getInvoiceImporterLogsByConfig(configId: number): Promise<InvoiceImporterLog[]> {
    return await db.select().from(invoiceImporterLogs)
      .where(eq(invoiceImporterLogs.configId, configId))
      .orderBy(desc(invoiceImporterLogs.createdAt));
  }

  async getInvoiceImporterLog(id: number): Promise<InvoiceImporterLog | null> {
    const [result] = await db.select().from(invoiceImporterLogs).where(eq(invoiceImporterLogs.id, id));
    return result || null;
  }

  async getLatestInvoiceImporterLog(configId: number): Promise<InvoiceImporterLog | null> {
    const [result] = await db.select().from(invoiceImporterLogs)
      .where(eq(invoiceImporterLogs.configId, configId))
      .orderBy(desc(invoiceImporterLogs.createdAt))
      .limit(1);
    return result || null;
  }

  async updateInvoiceImporterLog(id: number, updates: Partial<InsertInvoiceImporterLog>): Promise<void> {
    await db.update(invoiceImporterLogs).set(updates).where(eq(invoiceImporterLogs.id, id));
  }

  async deleteInvoiceImporterLog(id: number): Promise<void> {
    await db.delete(invoiceImporterLogs).where(eq(invoiceImporterLogs.id, id));
  }

  async createImportedInvoice(invoice: InsertImportedInvoice): Promise<ImportedInvoice> {
    const [result] = await db.insert(importedInvoices).values(invoice).returning();
    return result;
  }

  async getImportedInvoices(): Promise<ImportedInvoice[]> {
    return await db.select().from(importedInvoices).orderBy(desc(importedInvoices.createdAt));
  }

  async getImportedInvoicesByLog(logId: number): Promise<ImportedInvoice[]> {
    return await db.select().from(importedInvoices)
      .where(eq(importedInvoices.logId, logId))
      .orderBy(desc(importedInvoices.createdAt));
  }

  // ERP Tasks
  async createErpTask(task: InsertErpTask): Promise<ErpTask> {
    const [result] = await db.insert(erpTasks).values(task).returning();
    return result;
  }

  async getErpTask(id: number): Promise<ErpTask | null> {
    const [result] = await db.select().from(erpTasks).where(eq(erpTasks.id, id));
    return result || null;
  }

  async getErpTasks(): Promise<ErpTask[]> {
    return await db.select().from(erpTasks).orderBy(desc(erpTasks.createdAt));
  }

  async updateErpTask(id: number, updates: Partial<InsertErpTask>): Promise<void> {
    await db.update(erpTasks).set({
      ...updates,
      updatedAt: new Date()
    }).where(eq(erpTasks.id, id));
  }

  async deleteErpTask(id: number): Promise<void> {
    await db.delete(erpTasks).where(eq(erpTasks.id, id));
  }

  // Saved Workflows
  async createSavedWorkflow(workflow: InsertSavedWorkflow): Promise<SavedWorkflow> {
    const [result] = await db.insert(savedWorkflows).values(workflow).returning();
    return result;
  }

  async getSavedWorkflow(id: number): Promise<SavedWorkflow | null> {
    const [result] = await db.select().from(savedWorkflows).where(eq(savedWorkflows.id, id));
    return result || null;
  }

  async getSavedWorkflows(): Promise<SavedWorkflow[]> {
    return await db.select().from(savedWorkflows).orderBy(desc(savedWorkflows.createdAt));
  }

  async updateSavedWorkflow(id: number, updates: Partial<InsertSavedWorkflow>): Promise<void> {
    await db.update(savedWorkflows).set({
      ...updates,
      updatedAt: new Date()
    }).where(eq(savedWorkflows.id, id));
  }

  async deleteSavedWorkflow(id: number): Promise<void> {
    await db.delete(savedWorkflows).where(eq(savedWorkflows.id, id));
  }

  // Scheduled Tasks
  async createScheduledTask(task: InsertScheduledTask): Promise<ScheduledTask> {
    const [result] = await db.insert(scheduledTasks).values(task).returning();
    return result;
  }

  async getScheduledTask(id: number): Promise<ScheduledTask | null> {
    const [result] = await db.select().from(scheduledTasks).where(eq(scheduledTasks.id, id));
    return result || null;
  }

  async getScheduledTasks(): Promise<ScheduledTask[]> {
    return await db.select().from(scheduledTasks).orderBy(desc(scheduledTasks.createdAt));
  }

  async updateScheduledTask(id: number, updates: Partial<InsertScheduledTask>): Promise<void> {
    await db.update(scheduledTasks).set({
      ...updates,
      updatedAt: new Date()
    }).where(eq(scheduledTasks.id, id));
  }

  async deleteScheduledTask(id: number): Promise<void> {
    await db.delete(scheduledTasks).where(eq(scheduledTasks.id, id));
  }

  // Dashboard and utility methods
  async getDashboardStats(userId?: string): Promise<any> {
    try {
      // Get basic counts
      const totalInvoicesPromise = db.select({ count: sql<number>`count(*)` }).from(invoices)
        .where(userId ? eq(invoices.userId, userId) : sql`true`);

      const pendingInvoicesPromise = db.select({ count: sql<number>`count(*)` }).from(invoices)
        .where(and(
          eq(invoices.status, 'pending'),
          userId ? eq(invoices.userId, userId) : sql`true`
        ));

      const approvedInvoicesPromise = db.select({ count: sql<number>`count(*)` }).from(invoices)
        .where(and(
          eq(invoices.status, 'approved'),
          userId ? eq(invoices.userId, userId) : sql`true`
        ));

      const totalProjectsPromise = db.select({ count: sql<number>`count(*)` }).from(projects);

      const [totalInvoices, pendingInvoices, approvedInvoices, totalProjects] = await Promise.all([
        totalInvoicesPromise,
        pendingInvoicesPromise,
        approvedInvoicesPromise,
        totalProjectsPromise
      ]);

      return {
        totalInvoices: totalInvoices[0]?.count || 0,
        pendingInvoices: pendingInvoices[0]?.count || 0,
        approvedInvoices: approvedInvoices[0]?.count || 0,
        totalProjects: totalProjects[0]?.count || 0,
        recentInvoices: 0,
        processingTime: 0
      };
    } catch (error) {
      console.error('Error in getDashboardStats:', error);
      return {
        totalInvoices: 0,
        pendingInvoices: 0,
        approvedInvoices: 0,
        totalProjects: 0,
        recentInvoices: 0,
        processingTime: 0
      };
    }
  }

  async getPendingApprovals(): Promise<any[]> {
    try {
      return await db.select().from(approvals)
        .where(eq(approvals.status, 'pending'))
        .orderBy(desc(approvals.createdAt));
    } catch (error) {
      console.error('Error in getPendingApprovals:', error);
      return [];
    }
  }

  async getTopIssuesThisMonth(): Promise<any[]> {
    try {
      // Return placeholder data for now
      return [
        { issue: 'Missing vendor information', count: 5 },
        { issue: 'Date format errors', count: 3 },
        { issue: 'Amount extraction issues', count: 2 }
      ];
    } catch (error) {
      console.error('Error in getTopIssuesThisMonth:', error);
      return [];
    }
  }

  async deleteAllUserInvoices(userId: string): Promise<number> {
    try {
      // Get user information to find company
      const user = await this.getUser(userId);
      if (!user) {
        return 0;
      }

      // Get all invoices that user has access to (owned by user OR RPA invoices from same company)
      const accessibleInvoices = await db
        .select()
        .from(invoices)
        .where(
          or(
            eq(invoices.userId, userId),
            and(
              eq(invoices.userId, 'rpa-system'),
              eq(invoices.companyId, user.companyId ?? 0)
            )
          )
        );

      const count = accessibleInvoices.length;

      if (count > 0) {
        const invoiceIds = accessibleInvoices.map(inv => inv.id);

        // Delete linked imported invoice files first (for RPA invoices)
        const { Client } = await import('pg');
        const dbClient = new Client({
          connectionString: process.env.DATABASE_URL,
        });

        try {
          await dbClient.connect();

          // Get linked files that will be deleted so we can remove physical files
          const linkedFilesQuery = `
            SELECT file_path, original_file_name 
            FROM imported_invoices 
            WHERE linked_invoice_id = ANY($1)
          `;
          const linkedFiles = await dbClient.query(linkedFilesQuery, [invoiceIds]);

          // Delete physical files from disk
          const fs = await import('fs');
          for (const file of linkedFiles.rows) {
            try {
              if (fs.existsSync(file.file_path)) {
                fs.unlinkSync(file.file_path);
                console.log(`🗑️ Deleted physical file: ${file.file_path}`);
              }
            } catch (fileError) {
              console.error(`Error deleting physical file ${file.file_path}:`, fileError);
            }
          }

          // Delete linked PDF files from imported_invoices table
          const deleteResult = await dbClient.query(
            'DELETE FROM imported_invoices WHERE linked_invoice_id = ANY($1)',
            [invoiceIds]
          );

          console.log(`🗑️ Deleted ${deleteResult.rowCount} linked imported files for ${count} invoices`);

        } catch (error) {
          console.error(`Error deleting linked files for bulk deletion:`, error);
        } finally {
          await dbClient.end();
        }

        // Delete related records
        await db.delete(lineItems).where(inArray(lineItems.invoiceId, invoiceIds));
        await db.delete(feedbackLogs).where(inArray(feedbackLogs.invoiceId, invoiceIds));
        await db.delete(approvals).where(inArray(approvals.invoiceId, invoiceIds));
        await db.delete(invoicePoMatches).where(inArray(invoicePoMatches.invoiceId, invoiceIds));
        await db.delete(invoiceProjectMatches).where(inArray(invoiceProjectMatches.invoiceId, invoiceIds));

        // delete petty cash logs before invoices
        await db.delete(pettyCashLog).where(inArray(pettyCashLog.invoiceId, invoiceIds));

        // Finally delete the main invoices
        await db.delete(invoices).where(inArray(invoices.id, invoiceIds));

        console.log(`✅ Successfully deleted ${count} invoices and all related records`);
      }

      return count;
    } catch (error) {
      console.error('Error deleting all user invoices:', error);
      throw error;
    }
  }

  async deleteAllCompanyInvoices(companyId: number): Promise<number> {
    try {
      // First get count for return value
      const companyInvoices = await db
        .select({ count: sql<number>`count(*)` })
        .from(invoices)
        .where(eq(invoices.companyId, companyId));

      const count = companyInvoices[0]?.count || 0;

      if (count > 0) {
        // Delete line items first
        await db
          .delete(lineItems)
          .where(
            inArray(
              lineItems.invoiceId,
              db.select({ id: invoices.id }).from(invoices).where(eq(invoices.companyId, companyId))
            )
          );

        // Delete approvals
        await db
          .delete(approvals)
          .where(
            inArray(
              approvals.invoiceId,
              db.select({ id: invoices.id }).from(invoices).where(eq(invoices.companyId, companyId))
            )
          );

        // Delete invoice flags
        // await db
        //   .delete(invoiceFlags)
        //   .where(
        //     inArray(
        //       invoiceFlags.invoiceId,
        //       db.select({ id: invoices.id }).from(invoices).where(eq(invoices.companyId, companyId))
        //     )
        //   );

        // Delete feedback logs
        await db
          .delete(feedbackLogs)
          .where(
            inArray(
              feedbackLogs.invoiceId,
              db.select({ id: invoices.id }).from(invoices).where(eq(invoices.companyId, companyId))
            )
          );

        // Delete invoice-PO matches
        await db
          .delete(invoicePoMatches)
          .where(
            inArray(
              invoicePoMatches.invoiceId,
              db.select({ id: invoices.id }).from(invoices).where(eq(invoices.companyId, companyId))
            )
          );

        // Delete invoice-project matches
        await db
          .delete(invoiceProjectMatches)
          .where(
            inArray(
              invoiceProjectMatches.invoiceId,
              db.select({ id: invoices.id }).from(invoices).where(eq(invoices.companyId, companyId))
            )
          );

        // Delete petty cash logs
        await db
          .delete(pettyCashLog)
          .where(
            inArray(
              pettyCashLog.invoiceId,
              db.select({ id: invoices.id }).from(invoices).where(eq(invoices.companyId, companyId))
            )
          );

        // Delete feedback logs
        // await db
        //   .delete(feedbackLogs)
        //   .where(
        //     inArray(
        //       feedbackLogs.invoiceId,
        //       db.select({ id: invoices.id }).from(invoices).where(eq(invoices.companyId, companyId))
        //     )
        //   );

        // Finally delete the invoices
        await db.delete(invoices).where(eq(invoices.companyId, companyId));
      }

      return count;
    } catch (error) {
      console.error('Error deleting all company invoices:', error);
      throw error;
    }
  }

  // Settings methods
  async getSetting(key: string): Promise<any> {
    try {
      const [result] = await db.select().from(settings).where(eq(settings.key, key));

      if (!result) {
        // Return default settings if not found
        const defaultSettings: Record<string, any> = {
          petty_cash_threshold: { key, value: '1000', description: 'Petty cash threshold amount' },
          user_preferences: { 
            key, 
            value: JSON.stringify({
              fullName: '',
              department: '',
              phoneNumber: '',
              emailNotifications: true,
              dashboardLayout: 'grid',
              defaultCurrency: 'USD',
              timezone: 'America/New_York',
              aiProcessingMode: 'automatic',
              aiCacheEnabled: true,
              aiCacheExpiry: '24h',
              aiAutoInvalidation: 'on_update'
            }),
            description: 'User preferences and settings'
          }
        };

        const defaultSetting = defaultSettings[key];
        if (defaultSetting) {
          // Create the default setting in the database
          await this.setSetting(defaultSetting);
          return defaultSetting;
        }
        return null;
      }

      return result;
    } catch (error) {
      console.error('Error in getSetting:', error);
      return null;
    }
  }

  async updateSetting(key: string, value: string): Promise<any> {
    try {
      // First try to update existing setting
      const existing = await db.select().from(settings).where(eq(settings.key, key));

      if (existing.length > 0) {
        await db.update(settings)
          .set({ value, updatedAt: new Date() })
          .where(eq(settings.key, key));

        const [updated] = await db.select().from(settings).where(eq(settings.key, key));
        return updated;
      } else {
        // Create new setting if it doesn't exist
        const [newSetting] = await db.insert(settings)
          .values({ key, value, description: `Auto-created setting for ${key}` })
          .returning();
        return newSetting;
      }
    } catch (error) {
      console.error('Error in updateSetting:', error);
      throw error;
    }
  }

  async setSetting(setting: { key: string; value: string; description: string }): Promise<any> {
    try {
      const [result] = await db.insert(settings)
        .values(setting)
        .onConflictDoUpdate({
          target: settings.key,
          set: { 
            value: setting.value, 
            description: setting.description,
            updatedAt: new Date() 
          }
        })
        .returning();
      return result;
    } catch (error) {
      console.error('Error in setSetting:', error);
      throw error;
    }
  }

  // Learning and feedback methods
  async getTotalFeedbackCount(): Promise<number> {
    return 0;
  }

  async getLearningInsights(type?: string): Promise<any[]> {
    return [];
  }

  async storeLearningInsight(insight: any): Promise<void> {
    // Placeholder implementation
  }

  async createFeedbackLog(log: any): Promise<any> {
    return { id: Date.now(), ...log, createdAt: new Date() };
  }

  async getFeedbackLogs(limit: number = 50): Promise<any[]> {
    return [];
  }

  async getFeedbackLog(id: number): Promise<any> {
    return null;
  }

  async getInvoicesWithProjectMatches(userId: string): Promise<any[]> {
    try {
      const query = db
        .select({
          invoice: invoices,
          matches: sql<any[]>`COALESCE(json_agg(json_build_object('id', ${invoiceProjectMatches.id}, 'projectId', ${invoiceProjectMatches.projectId}, 'matchScore', ${invoiceProjectMatches.matchScore}, 'status', ${invoiceProjectMatches.status}, 'matchDetails', ${invoiceProjectMatches.matchDetails}, 'isActive', ${invoiceProjectMatches.isActive}, 'project', json_build_object('projectId', ${projects.projectId}, 'name', ${projects.name}, 'city', ${projects.city}, 'address', ${projects.address}))) FILTER (WHERE ${invoiceProjectMatches.id} IS NOT NULL), '[]'::json)`
        })
        .from(invoices)
        .leftJoin(
          invoiceProjectMatches,
          eq(invoices.id, invoiceProjectMatches.invoiceId)
        )
        .leftJoin(
          projects,
          eq(invoiceProjectMatches.projectId, projects.projectId)
        )
        .where(eq(invoices.userId, userId))
        .groupBy(invoices.id)
        .orderBy(desc(invoices.createdAt));

      const results = await query;

      return results.map(result => ({
        ...result.invoice,
        projectMatches: result.matches || []
      }));
    } catch (error) {
      console.error('Error in getInvoicesWithProjectMatches:', error);
      throw error;
    }
  }

  async getCompanyInvoicesWithProjectMatches(companyId: number): Promise<any[]> {
    try {
      const query = db
        .select({
          invoice: invoices,
          matches: sql<any[]>`COALESCE(json_agg(json_build_object('id', ${invoiceProjectMatches.id}, 'projectId', ${invoiceProjectMatches.projectId}, 'matchScore', ${invoiceProjectMatches.matchScore}, 'status', ${invoiceProjectMatches.status}, 'matchDetails', ${invoiceProjectMatches.matchDetails}, 'isActive', ${invoiceProjectMatches.isActive}, 'project', json_build_object('projectId', ${projects.projectId}, 'name', ${projects.name}, 'city', ${projects.city}, 'address', ${projects.address}))) FILTER (WHERE ${invoiceProjectMatches.id} IS NOT NULL), '[]'::json)`
        })
        .from(invoices)
        .leftJoin(
          invoiceProjectMatches,
          eq(invoices.id, invoiceProjectMatches.invoiceId)
        )
        .leftJoin(
          projects,
          eq(invoiceProjectMatches.projectId, projects.projectId)
        )
        .where(eq(invoices.companyId, companyId))
        .groupBy(invoices.id)
        .orderBy(desc(invoices.createdAt));

      const results = await query;

      return results.map(result => ({
        ...result.invoice,
        projectMatches: result.matches || []
      }));
    } catch (error) {
      console.error('Error in getCompanyInvoicesWithProjectMatches:', error);
      throw error;
    }
  }

  // Additional methods for complete interface compatibility


  async getValidationRules(): Promise<any[]> {
    return [];
  }

  async getValidationRule(id: number): Promise<any> {
    return null;
  }

  async createValidationRule(rule: any): Promise<any> {
    return { id: Date.now(), ...rule, createdAt: new Date() };
  }

  async updateValidationRule(id: number, updates: any): Promise<any> {
    return { id, ...updates, updatedAt: new Date() };
  }

  async deleteValidationRule(id: number): Promise<void> {
    // Placeholder implementation
  }

  async validateInvoiceData(invoiceData: any): Promise<any> {
    return { isValid: true, violations: [] };
  }

  async validateAllApprovedInvoices(): Promise<any> {
    return {
      totalInvoices: 0,
      verified: 0,
      flagged: 0,
      needsReview: 0,
      pending: 0,
      invoiceValidations: []
    };
  }



  async deleteAllProjects(): Promise<void> {
    await db.delete(projects);
  }

  async getPurchaseOrderByPoId(poId: string): Promise<PurchaseOrder | null> {
    const [result] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.poId, poId));
    return result || null;
  }

  async getAllPurchaseOrders(): Promise<PurchaseOrder[]> {
    return await this.getPurchaseOrders();
  }

  async getInvoicePoMatches(): Promise<any[]> {
    return await db.select().from(invoicePoMatches);
  }

  async assignProjectToInvoice(invoiceId: number, projectId: string): Promise<void> {
    // Get the project to extract the name
    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.projectId, projectId))
      .limit(1);

    if (project.length === 0) {
      throw new Error(`Project with ID ${projectId} not found`);
    }

    const projectName = project[0].name;

    // Get current invoice data
    const invoice = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    if (invoice.length === 0) {
      throw new Error(`Invoice with ID ${invoiceId} not found`);
    }

    // Update the extractedData to include the assigned project name
    const currentExtractedData = invoice[0].extractedData || {};
    const updatedExtractedData = {
      ...currentExtractedData,
      assignedProject: projectName,
      assignedProjectId: projectId
    };

    // Update the invoice with the new extractedData
    await db
      .update(invoices)
      .set({
        extractedData: updatedExtractedData,
        updatedAt: new Date()
      })
      .where(eq(invoices.id, invoiceId));
  }

  async updateInvoicePoMatch(id: number, updates: any): Promise<any> {
    return { id, ...updates, updatedAt: new Date() };
  }

  async getUnresolvedMatches(): Promise<any[]> {
    return [];
  }

  async getInvoiceProjectMatches(): Promise<any[]> {
    return await db.select().from(invoiceProjectMatches);
  }

  async findPotentialProjectMatches(invoice: any): Promise<any[]> {
    try {
      const projects = await this.getProjects();
      
      if (!projects || projects.length === 0) {
        return [];
      }
      
      const extractedData = invoice.extractedData || {};
      const invoiceAddress = extractedData.projectAddress || extractedData.address || '';
      const invoiceCity = extractedData.projectCity || extractedData.city || '';
      const invoiceProjectName = extractedData.projectName || '';
      
      const matches = [];
      
      // Score each project based on similarity
      for (const project of projects) {
        let score = 0;
        const reasons = [];
        
        // Project name matching (40% weight)
        if (invoiceProjectName && project.name) {
          const nameSimilarity = this.calculateStringSimilarity(invoiceProjectName, project.name);
          if (nameSimilarity > 40) {
            score += nameSimilarity * 0.4;
            reasons.push(`Project name similarity: ${nameSimilarity}%`);
          }
        }
        
        // Address matching (35% weight)
        if (invoiceAddress && project.address) {
          const addressSimilarity = this.calculateStringSimilarity(invoiceAddress, project.address);
          if (addressSimilarity > 30) {
            score += addressSimilarity * 0.35;
            reasons.push(`Address similarity: ${addressSimilarity}%`);
          }
        }
        
        // City matching (25% weight)
        if (invoiceCity && project.city) {
          const citySimilarity = this.calculateStringSimilarity(invoiceCity, project.city);
          if (citySimilarity > 50) {
            score += citySimilarity * 0.25;
            reasons.push(`City similarity: ${citySimilarity}%`);
          }
        }
        
        if (score > 20) {  // Lower threshold for potential matches
          matches.push({
            project,
            matchScore: Math.round(score),
            matchReasons: reasons,
            confidence: Math.round(score)
          });
        }
      }
      
      // Sort by match score descending
      return matches.sort((a, b) => b.matchScore - a.matchScore);
      
    } catch (error) {
      console.error('Error finding potential project matches:', error);
      return [];
    }
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;
    
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    if (s1 === s2) return 100;
    
    // Simple fuzzy matching using character overlap
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    
    if (longer.length === 0) return 100;
    
    const matches = shorter.split('').filter(char => longer.includes(char)).length;
    return Math.round((matches / longer.length) * 100);
  }

  async updateInvoiceProjectMatch(id: number, updates: any): Promise<any> {
    return { id, ...updates, updatedAt: new Date() };
  }

  async setActiveProjectMatch(invoiceId: number, projectId: number): Promise<void> {
    // Placeholder implementation
  }

  async getUnresolvedProjectMatches(): Promise<any[]> {
    return [];
  }

  async getInvoiceFlags(): Promise<any[]> {
    return [];
  }

  async resolveInvoiceFlag(id: number): Promise<void> {
    // Placeholder implementation
  }

  async getPredictiveAlerts(): Promise<any[]> {
    return [];
  }

  async getClassificationKeywords(): Promise<any[]> {
    return [];
  }

  async addClassificationKeyword(keywordData: any): Promise<any> {
    const [result] = await db
      .insert(classificationKeywords)
      .values(keywordData)
      .returning();
    return result;
  }

  async removeClassificationKeyword(keywordId: number, userId?: string): Promise<void> {
    if (userId) {
      await db
        .delete(classificationKeywords)
        .where(
          and(
            eq(classificationKeywords.id, keywordId),
            eq(classificationKeywords.userId, userId),
            eq(classificationKeywords.isDefault, false)
          )
        );
    } else {
      await db
        .delete(classificationKeywords)
        .where(eq(classificationKeywords.id, keywordId));
    }
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
        classifiedAt: lineItemClassifications.classifiedAt,
        classifiedBy: lineItemClassifications.classifiedBy,
      })
      .from(lineItems)
      .leftJoin(
        lineItemClassifications,
        eq(lineItems.id, lineItemClassifications.lineItemId)
      )
      .where(eq(lineItems.invoiceId, invoiceId))
      .orderBy(lineItems.id);

    return result.map(item => ({
      lineItemId: item.lineItemId,
      description: item.description,
      quantity: parseFloat(item.quantity),
      unitPrice: parseFloat(item.unitPrice),
      totalPrice: parseFloat(item.totalPrice),
      category: item.category,
      matchedKeyword: item.matchedKeyword,
      confidence: item.confidence ? parseFloat(item.confidence) : null,
      isManualOverride: item.isManualOverride || false,
      classifiedAt: item.classifiedAt,
      classifiedBy: item.classifiedBy,
    }));
  }

  async updateLineItemClassification(lineItemId: number, category: string, userId: string): Promise<void> {
    // Check if classification already exists
    const existingClassification = await db
      .select()
      .from(lineItemClassifications)
      .where(eq(lineItemClassifications.lineItemId, lineItemId))
      .limit(1);

    if (existingClassification.length > 0) {
      // Update existing classification
      await db
        .update(lineItemClassifications)
        .set({
          category: category as any,
          isManualOverride: true,
          classifiedBy: userId,
          classifiedAt: new Date(),
        })
        .where(eq(lineItemClassifications.lineItemId, lineItemId));
    } else {
      // Insert new classification
      await db.insert(lineItemClassifications).values({
        lineItemId,
        category: category as any,
        isManualOverride: true,
        classifiedBy: userId,
        confidence: '1.00',
        matchedKeyword: 'Manual Override',
        classifiedAt: new Date(),
      });
    }
  }

  async createApprovedInvoiceProject(data: any): Promise<any> {
    return { id: Date.now(), ...data, createdAt: new Date() };
  }

  async getApprovedInvoiceProjects(): Promise<any[]> {
    return [];
  }

  async getVerifiedInvoiceProjects(): Promise<any[]> {
    return [];
  }

  async getInvoicePoMatchesWithDetails(): Promise<any[]> {
    return [];
  }

  async moveApprovedToVerified(id: number): Promise<void> {
    // Placeholder implementation
  }

  async updateImportedInvoice(id: number, updates: any): Promise<void> {
    await db.update(importedInvoices).set({
      ...updates,
      updatedAt: new Date()
    }).where(eq(importedInvoices.id, id));
  }

  // Duplicates removed - these functions already exist above

  // Enhanced import logs with comprehensive metadata
  async getImportLogsWithDetails(): Promise<any[]> {
    const result = await db
      .select({
        logId: invoiceImporterLogs.id,
        configId: invoiceImporterLogs.configId,
        configurationName: invoiceImporterConfigs.taskName,
        erpConnectionId: invoiceImporterConfigs.connectionId,
        userId: invoiceImporterConfigs.userId,
        startTime: invoiceImporterLogs.startedAt,
        endTime: invoiceImporterLogs.completedAt,
        duration: sql<number>`
          CASE 
            WHEN ${invoiceImporterLogs.completedAt} IS NOT NULL AND ${invoiceImporterLogs.startedAt} IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (${invoiceImporterLogs.completedAt} - ${invoiceImporterLogs.startedAt}))
            ELSE NULL 
          END
        `,
        status: invoiceImporterLogs.status,
        totalInvoices: invoiceImporterLogs.totalInvoices,
        processedInvoices: invoiceImporterLogs.processedInvoices,
        successfulImports: invoiceImporterLogs.successfulImports,
        failedImports: invoiceImporterLogs.failedImports,
        skippedImports: invoiceImporterLogs.skippedImports,
        fileType: invoiceImporterConfigs.fileTypes,
        logs: invoiceImporterLogs.logs,
        errorMessage: invoiceImporterLogs.errorMessage,
        createdAt: invoiceImporterLogs.createdAt,
        triggeredBy: sql<string>`
          CASE 
            WHEN ${invoiceImporterConfigs.scheduleType} = 'once' THEN 'Manual'
            ELSE 'Scheduled'
          END
        `
      })
      .from(invoiceImporterLogs)
      .leftJoin(invoiceImporterConfigs, eq(invoiceImporterLogs.configId, invoiceImporterConfigs.id))
      .orderBy(desc(invoiceImporterLogs.startedAt));

    return result.map(log => ({
      ...log,
      duration: log.duration ? Math.round(log.duration) : null,
      startTime: log.startTime?.toISOString(),
      endTime: log.endTime?.toISOString(),
      createdAt: log.createdAt?.toISOString()
    }));
  }

  // Get users by company for multi-tenant filtering
  async getUsersByCompany(companyId: number): Promise<User[]> {
    return await db.select().from(users).where(eq(users.companyId, companyId));
  }

  // Petty Cash Log Management
  async createPettyCashLog(log: {
    invoiceId: number;
    projectId?: string;
    costCenter?: string;
    approvedBy?: string;
    approvalFileUrl?: string;
    status?: 'pending_approval' | 'approved' | 'rejected';
    approvalNotes?: string;
    approvedAt?: Date;
  }): Promise<any> {
    try {
      const { Client } = await import('pg');
      const dbClient = new Client({
        connectionString: process.env.DATABASE_URL,
      });

      await dbClient.connect();

      // Check if log already exists for this invoice
      const existingLog = await dbClient.query(
        'SELECT id FROM petty_cash_log WHERE invoice_id = $1',
        [log.invoiceId]
      );

      if (existingLog.rows.length > 0) {
        console.log(`Petty cash log already exists for invoice ${log.invoiceId}`);
        await dbClient.end();
        return existingLog.rows[0];
      }

      // Insert new petty cash log
      const result = await dbClient.query(`
        INSERT INTO petty_cash_log (
          invoice_id, project_id, cost_center, approved_by, 
          approval_file_url, status, approval_notes, approved_at,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING *
      `, [
        log.invoiceId,
        log.projectId || null,
        log.costCenter || null,
        log.approvedBy || null,
        log.approvalFileUrl || null,
        log.status || 'pending_approval',
        log.approvalNotes || null,
        log.approvedAt || null
      ]);

      await dbClient.end();
      console.log(`✅ Created petty cash log for invoice ${log.invoiceId}`);
      return result.rows[0];
    } catch (error) {
      console.error('Error creating petty cash log:', error);
      throw error;
    }
  }

  async updatePettyCashLog(id: number, updates: {
    projectId?: string;
    costCenter?: string;
    approvedBy?: string;
    approvalFileUrl?: string;
    status?: 'pending_approval' | 'approved' | 'rejected';
    approvalNotes?: string;
    approvedAt?: Date;
  }): Promise<any> {
    try {
      const { Client } = await import('pg');
      const dbClient = new Client({
        connectionString: process.env.DATABASE_URL,
      });

      await dbClient.connect();

      const setClause = [];
      const values = [];
      let paramIndex = 1;

      if (updates.projectId !== undefined) {
        setClause.push(`project_id = $${paramIndex++}`);
        values.push(updates.projectId);
      }
      if (updates.costCenter !== undefined) {
        setClause.push(`cost_center = $${paramIndex++}`);
        values.push(updates.costCenter);
      }
      if (updates.approvedBy !== undefined) {
        setClause.push(`approved_by = $${paramIndex++}`);
        values.push(updates.approvedBy);
      }
      if (updates.approvalFileUrl !== undefined) {
        setClause.push(`approval_file_url = $${paramIndex++}`);
        values.push(updates.approvalFileUrl);
      }
      if (updates.status !== undefined) {
        setClause.push(`status = $${paramIndex++}`);
        values.push(updates.status);
      }
      if (updates.approvalNotes !== undefined) {
        setClause.push(`approval_notes = $${paramIndex++}`);
        values.push(updates.approvalNotes);
      }
      if (updates.approvedAt !== undefined) {
        setClause.push(`approved_at = $${paramIndex++}`);
        values.push(updates.approvedAt);
      }

      setClause.push(`updated_at = NOW()`);
      values.push(id);

      const result = await dbClient.query(`
        UPDATE petty_cash_log 
        SET ${setClause.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `, values);

      await dbClient.end();
      return result.rows[0];
    } catch (error) {
      console.error('Error updating petty cash log:', error);
      throw error;
    }
  }

  async getPettyCashLogs(status?: string): Promise<any[]> {
    try {
      const { Client } = await import('pg');
      const dbClient = new Client({
        connectionString: process.env.DATABASE_URL,
      });

      await dbClient.connect();

      let query = `
        SELECT 
          pcl.*,
          json_build_object(
            'id', i.id,
            'vendorName', i.vendor_name,
            'invoiceNumber', i.invoice_number,
            'totalAmount', i.total_amount,
            'fileName', i.file_name,
            'createdAt', i.created_at
          ) as invoice
        FROM petty_cash_log pcl
        JOIN invoices i ON pcl.invoice_id = i.id
      `;

      const values = [];
      if (status) {
        query += ' WHERE pcl.status = $1';
        values.push(status);
      }

      query += ' ORDER BY pcl.created_at DESC';

      const result = await dbClient.query(query, values);
      await dbClient.end();

      return result.rows;
    } catch (error) {
      console.error('Error fetching petty cash logs:', error);
      return [];
    }
  }

  async getPettyCashLogByInvoiceId(invoiceId: number): Promise<any> {
    try {
      const { Client } = await import('pg');
      const dbClient = new Client({
        connectionString: process.env.DATABASE_URL,
      });

      await dbClient.connect();

      const result = await dbClient.query(`
        SELECT 
          pcl.*,
          json_build_object(
            'id', i.id,
            'vendorName', i.vendor_name,
            'invoiceNumber', i.invoice_number,
            'totalAmount', i.total_amount,
            'fileName', i.file_name,
            'createdAt', i.created_at
          ) as invoice
        FROM petty_cash_log pcl
        JOIN invoices i ON pcl.invoice_id = i.id
        WHERE pcl.invoice_id = $1
      `, [invoiceId]);

      await dbClient.end();
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error fetching petty cash log by invoice ID:', error);
      return null;
    }
  }

  // Petty Cash Classification Function
  async isPettyCashInvoice(invoiceId: number): Promise<boolean> {
    try {
      // Get the full invoice record
      const invoice = await this.getInvoice(invoiceId);
      if (!invoice) {
        console.log(`[PETTY CASH] Invoice ${invoiceId} not found`);
        return false;
      }

      // Get threshold
      const thresholdSetting = await this.getSetting('petty_cash_threshold');
      const threshold = thresholdSetting ? parseFloat(thresholdSetting.value) : 400000;

      console.log(`[PETTY CASH] Invoice ${invoiceId} (${invoice.fileName})`);
      console.log(`[PETTY CASH] Main table totalAmount: ${invoice.totalAmount}`);
      console.log(`[PETTY CASH] Currency: ${invoice.currency}`);
      console.log(`[PETTY CASH] Threshold: ${threshold}`);

      // Use main table totalAmount
      let amount = 0;
      if (invoice.totalAmount && invoice.totalAmount !== 'null') {
        amount = parseFloat(invoice.totalAmount);
      } else {
        // Fallback to extractedData if main table is empty
        const extractedData = invoice.extractedData as any;
        if (extractedData?.totalAmount) {
          amount = parseFloat(extractedData.totalAmount);
          console.log(`[PETTY CASH] Using extractedData fallback: ${amount}`);
        }
      }

      const isPetty = amount > 0 && amount < threshold;
      console.log(`[PETTY CASH] Final calculation: ${amount} < ${threshold} = ${isPetty}`);

      return isPetty;
    } catch (error) {
      console.error(`[PETTY CASH] Error checking invoice ${invoiceId}:`, error);
      return false;
    }
  }

  // Automatically create petty cash log when invoice is classified as petty cash
  async classifyAndCreatePettyCashLog(invoiceId: number): Promise<boolean> {
    try {
      const isPetty = await this.isPettyCashInvoice(invoiceId);

      if (isPetty) {
        // Check if log already exists
        const existingLog = await this.getPettyCashLogByInvoiceId(invoiceId);

        if (!existingLog) {
          // Create petty cash log
          const invoice = await this.getInvoice(invoiceId);
          if (invoice) {
            const approvalNotes = `${invoice.fileName} - Vendor: ${invoice.vendorName || 'Unknown'} - Amount: ${invoice.currency || 'COP'} ${invoice.totalAmount || '0'}`;

            await this.createPettyCashLog({
              invoiceId,
              status: 'pending_approval',
              approvalNotes
            });

            console.log(`[PETTY CASH] Created log for invoice ${invoiceId}`);
          }
        }

        return true;
      }

      return false;
    } catch (error) {
      console.error(`[PETTY CASH] Error classifying invoice ${invoiceId}:`, error);
      return false;
    }
  }

  // Sync existing petty cash invoices to create missing logs
  async syncPettyCashLogs(): Promise<{ created: number; skipped: number; errors: number }> {
    try {
      console.log('[PETTY CASH SYNC] Starting sync of existing petty cash invoices...');

      // Get all invoices marked as petty cash
      const { Client } = await import('pg');
      const dbClient = new Client({
        connectionString: process.env.DATABASE_URL,
      });

      await dbClient.connect();

      // Find invoices with petty_cash_flag = true OR status = 'petty_cash'
      const result = await dbClient.query(`
        SELECT id, file_name, vendor_name, total_amount, currency, created_at
        FROM invoices 
        WHERE petty_cash_flag = true OR status = 'petty_cash'
        ORDER BY created_at DESC
      `);

      let created = 0;
      let skipped = 0;
      let errors = 0;

      for (const invoice of result.rows) {
        try {
          // Check if log already exists
          const existingLog = await this.getPettyCashLogByInvoiceId(invoice.id);

          if (existingLog) {
            skipped++;
            console.log(`[PETTY CASH SYNC] Log already exists for invoice ${invoice.id}`);
            continue;
          }

          // Create petty cash log
          const approvalNotes = `${invoice.file_name} - Vendor: ${invoice.vendor_name || 'Unknown'} - Amount: ${invoice.currency || 'COP'} ${invoice.total_amount || '0'}`;

          await this.createPettyCashLog({
            invoiceId: invoice.id,
            status: 'pending_approval',
            approvalNotes
          });

          created++;
          console.log(`[PETTY CASH SYNC] Created log for invoice ${invoice.id}`);

        } catch (error) {
          console.error(`[PETTY CASH SYNC] Error processing invoice ${invoice.id}:`, error);
          errors++;
        }
      }

      await dbClient.end();

      console.log(`[PETTY CASH SYNC] Completed: ${created} created, ${skipped} skipped, ${errors} errors`);

      return { created, skipped, errors };

    } catch (error) {
      console.error('[PETTY CASH SYNC] Error during sync:', error);
      throw error;
    }
  }

  // Recalculate all invoices for petty cash classification
  async recalculatePettyCashInvoices(): Promise<{ processed: number; classified: number; logs_created: number }> {
    try {
      console.log('[PETTY CASH RECALC] Starting recalculation of all invoices...');

      // Get all invoices
      const allInvoices = await this.getInvoices();
      let processed = 0;
      let classified = 0;
      let logsCreated = 0;

      for (const invoice of allInvoices) {
        try {
          processed++;

          // Check if invoice qualifies as petty cash
          const isPetty = await this.isPettyCashInvoice(invoice.id);

          if (isPetty) {
            classified++;

            // Update invoice flags
            await this.updateInvoice(invoice.id, {
              pettyCashFlag: true,
              status: invoice.status === 'pending' ? 'petty_cash' : invoice.status
            });

            // Check if log exists, create if not
            const existingLog = await this.getPettyCashLogByInvoiceId(invoice.id);

            if (!existingLog) {
              const approvalNotes = `${invoice.fileName} - Vendor: ${invoice.vendorName || 'Unknown'} - Amount: ${invoice.currency || 'COP'} ${invoice.totalAmount || '0'}`;

              await this.createPettyCashLog({
                invoiceId: invoice.id,
                status: 'pending_approval',
                approvalNotes
              });

              logsCreated++;
            }
          }

        } catch (error) {
          console.error(`[PETTY CASH RECALC] Error processing invoice ${invoice.id}:`, error);
        }
      }

      console.log(`[PETTY CASH RECALC] Completed: ${processed} processed, ${classified} classified as petty cash, ${logsCreated} logs created`);

      return { processed, classified, logs_created: logsCreated };

    } catch (error) {
      console.error('[PETTY CASH RECALC] Error during recalculation:', error);
      throw error;
    }
  }
}

export const storage: IStorage = new PostgresStorage();

// Helper function to get total invoice count
export async function getInvoiceCount(): Promise<number> {
  try {
    const result = await db.select({ count: sql`count(*)` }).from(invoices);
    return Number(result[0].count);
  } catch (error) {
    console.error('Error getting invoice count:', error);
    return 0;
  }
}

// Helper function to get invoice count from last 24 hours
export async function getInvoicesCount24Hours(): Promise<number> {
  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await db.select({ count: sql`count(*)` })
      .from(invoices)
      .where(gte(invoices.createdAt, yesterday));
    return Number(result[0].count);
  } catch (error) {
    console.error('Error getting 24h invoice count:', error);
    return 0;
  }
}

// Helper function to get invoices by status
export async function getInvoicesByStatus(status: string, limit: number = 50): Promise<any[]> {
  try {
    return await db.select()
      .from(invoices)
      .where(sql`${invoices.status} = ${status}`)
      .orderBy(desc(invoices.createdAt))
      .limit(limit);
  } catch (error) {
    console.error('Error getting invoices by status:', error);
    return [];
  }
}

// Helper function to get recent invoices
export async function getRecentInvoices(limit: number = 50): Promise<any[]> {
  try {
    return await db.select()
      .from(invoices)
      .orderBy(desc(invoices.createdAt))
      .limit(limit);
  } catch (error) {
    console.error('Error getting recent invoices:', error);
    return [];
  }
}

// Helper function to get database statistics
export async function getDatabaseStats(): Promise<any> {
  try {
    const invoiceCount = await getInvoiceCount();
    const recentCount = await getInvoicesCount24Hours();

    // Get status distribution
    const statusCounts = await db.select({
      status: invoices.status,
      count: sql`count(*)`
    })
    .from(invoices)
    .groupBy(invoices.status);

    return {
      totalInvoices: invoiceCount,
      recentInvoices: recentCount,
      statusDistribution: statusCounts.reduce((acc: any, item: any) => {
        acc[item.status] = Number(item.count);
        return acc;
      }, {})
    };
  } catch (error) {
    console.error('Error getting database stats:', error);
    return {
      totalInvoices: 0,
      recentInvoices: 0,
      statusDistribution: {}
    };
  }
}