import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { sql, eq, desc, gte, and, or, ilike, isNull, inArray, getTableColumns } from 'drizzle-orm';
import { 
  invoices, 
  lineItems, 
  approvals, 
  companies, 
  users,
  projects,
  purchaseOrders,
  invoicePoMatches,
  invoiceProjectMatches,
  validationRules,
  settings,
  erpConnections,
  invoiceImporterConfigs,
  invoiceImporterLogs,
  importedInvoices,
  erpTasks,
  savedWorkflows,
  scheduledTasks,
  feedbackLogs,
  lineItemClassifications,
  classificationKeywords,
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
  type ValidationRule,
  type InsertValidationRule,
  type Setting,
  type InsertSetting,
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
  type InsertScheduledTask,
  type LineItemClassification,
  type InsertLineItemClassification,
  type ClassificationKeyword,
  type InsertClassificationKeyword
} from "@shared/schema";

import FallbackStorage from "./fallback-storage";

let db: any;
let isDbConnected = false;
let fallbackStorage: FallbackStorage | null = null;
let initPromise: Promise<void> | null = null;

// Initialize database with connection retry logic
async function initializeDb(): Promise<void> {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required");
    }

    console.log("🔄 Initializing database connection...");
    const client = neon(process.env.DATABASE_URL);
    db = drizzle(client);

    // Test connection
    await db.select({ count: sql`1` });
    isDbConnected = true;
    console.log("✅ Database connected successfully");
    fallbackStorage = null; // Clear fallback if DB works
  } catch (error) {
    console.error("❌ Database connection failed, using fallback storage:", error);
    isDbConnected = false;
    db = null;
    fallbackStorage = new FallbackStorage();
  }
}

// Initialize on startup and cache the promise
initPromise = initializeDb();

// Helper function to ensure database is initialized
export async function ensureDbConnected(): Promise<void> {
  if (initPromise) {
    await initPromise;
    initPromise = null;
  }
}

// Export database instance for services that need direct access
export async function getDb() {
  await ensureDbConnected();
  if (!isDbConnected || !db) {
    throw new Error("Database not connected. Using fallback storage instead.");
  }
  return db;
}

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
  getValidationRules(): Promise<ValidationRule[]>;
  getValidationRule(id: number): Promise<ValidationRule | null>;
  createValidationRule(rule: InsertValidationRule): Promise<ValidationRule>;
  updateValidationRule(id: number, updates: Partial<InsertValidationRule>): Promise<ValidationRule>;
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
  assignProjectToInvoice(invoiceId: number, projectId: number): Promise<void>;
  updateInvoicePoMatch(id: number, updates: any): Promise<any>;
  getUnresolvedMatches(): Promise<any[]>;
  getInvoiceProjectMatches(): Promise<any[]>;
  findPotentialProjectMatches(invoiceId: number): Promise<any[]>;
  updateInvoiceProjectMatch(id: number, updates: any): Promise<any>;
  setActiveProjectMatch(invoiceId: number, projectId: number): Promise<void>;
  getUnresolvedProjectMatches(): Promise<any[]>;
  getInvoiceFlags(): Promise<any[]>;
  resolveInvoiceFlag(id: number): Promise<void>;
  getPredictiveAlerts(): Promise<any[]>;
  getClassificationKeywords(): Promise<ClassificationKeyword[]>;
  addClassificationKeyword(keyword: InsertClassificationKeyword): Promise<ClassificationKeyword>;
  removeClassificationKeyword(id: number): Promise<void>;
  getLineItemClassifications(): Promise<LineItemClassification[]>;
  getLineItemClassificationsByInvoice(invoiceId: number): Promise<LineItemClassification[]>;
  createLineItemClassification(data: InsertLineItemClassification): Promise<LineItemClassification>;
  updateLineItemClassification(id: number, updates: Partial<InsertLineItemClassification>): Promise<LineItemClassification>;
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

  async updateInvoice(id: number, updates: Partial<InsertInvoice>): Promise<void> {
    await db.update(invoices).set({
      ...updates,
      updatedAt: new Date()
    }).where(eq(invoices.id, id));
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

    // Delete related records (must follow foreign key dependency order)

    // First, get all line item IDs for this invoice
    const lineItemsToDelete = await db
      .select({ id: lineItems.id })
      .from(lineItems)
      .where(eq(lineItems.invoiceId, id));

    const lineItemIds = lineItemsToDelete.map(item => item.id);

    // Delete line item classifications first (they reference line_items)
    if (lineItemIds.length > 0) {
      await db.delete(lineItemClassifications).where(inArray(lineItemClassifications.lineItemId, lineItemIds));
      console.log(`🗑️ Deleted line item classifications for ${lineItemIds.length} line items`);
    }

    // Now safe to delete line items
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

  async getProjectByProjectId(projectId: string): Promise<Project | null> {
    const [result] = await db.select().from(projects).where(eq(projects.projectId, projectId));
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
      console.log(`📊 Getting dashboard stats for user: ${userId}`);

      // Get user information to find company for accessing RPA invoices
      let whereCondition = sql`true`;
      if (userId) {
        const user = await this.getUser(userId);
        if (user && user.companyId) {
          console.log(`👤 User ${userId} belongs to company ${user.companyId}`);
          // Include both user-owned invoices AND RPA invoices from the same company
          whereCondition = or(
            eq(invoices.userId, userId),
            and(
              eq(invoices.userId, 'rpa-system'),
              eq(invoices.companyId, user.companyId)
            )
          );
        } else {
          console.log(`👤 User ${userId} found, using user-only filter`);
          whereCondition = eq(invoices.userId, userId);
        }
      }

      // Get basic counts with company-aware filtering
      const totalInvoicesPromise = db.select({ count: sql<number>`count(*)` }).from(invoices)
        .where(whereCondition || sql`true`);

      const pendingInvoicesPromise = db.select({ count: sql<number>`count(*)` }).from(invoices)
        .where(and(
          eq(invoices.status, 'pending'),
          whereCondition || sql`true`
        ));

      const approvedInvoicesPromise = db.select({ count: sql<number>`count(*)` }).from(invoices)
        .where(and(
          eq(invoices.status, 'approved'),
          whereCondition || sql`true`
        ));

      // Also get extracted, rejected status counts for completeness
      const extractedInvoicesPromise = db.select({ count: sql<number>`count(*)` }).from(invoices)
        .where(and(
          eq(invoices.status, 'extracted'),
          whereCondition || sql`true`
        ));

      const rejectedInvoicesPromise = db.select({ count: sql<number>`count(*)` }).from(invoices)
        .where(and(
          eq(invoices.status, 'rejected'),
          whereCondition || sql`true`
        ));

      const totalProjectsPromise = db.select({ count: sql<number>`count(*)` }).from(projects);

      const [totalInvoices, pendingInvoices, approvedInvoices, extractedInvoices, rejectedInvoices, totalProjects] = await Promise.all([
        totalInvoicesPromise,
        pendingInvoicesPromise,
        approvedInvoicesPromise,
        extractedInvoicesPromise,
        rejectedInvoicesPromise,
        totalProjectsPromise
      ]);

      const stats = {
        totalInvoices: totalInvoices[0]?.count || 0,
        pendingInvoices: pendingInvoices[0]?.count || 0,
        approvedInvoices: approvedInvoices[0]?.count || 0,
        extractedInvoices: extractedInvoices[0]?.count || 0,
        rejectedInvoices: rejectedInvoices[0]?.count || 0,
        totalProjects: totalProjects[0]?.count || 0,
        recentInvoices: 0,
        processingTime: 0
      };

      console.log(`📊 Dashboard stats result:`, stats);
      return stats;
    } catch (error) {
      console.error('Error in getDashboardStats:', error);
      return {
        totalInvoices: 0,
        pendingInvoices: 0,
        approvedInvoices: 0,
        extractedInvoices: 0,
        rejectedInvoices: 0,
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
              eq(invoices.companyId, user.companyId)
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

        // Delete related records (must follow foreign key dependency order)

        // First, get all line item IDs for these invoices
        const lineItemsToDelete = await db
          .select({ id: lineItems.id })
          .from(lineItems)
          .where(inArray(lineItems.invoiceId, invoiceIds));

        const lineItemIds = lineItemsToDelete.map(item => item.id);

        // Delete line item classifications first (they reference line_items)
        if (lineItemIds.length > 0) {
          await db.delete(lineItemClassifications).where(inArray(lineItemClassifications.lineItemId, lineItemIds));
          console.log(`🗑️ Deleted line item classifications for ${lineItemIds.length} line items`);
        }

        // Now safe to delete line items
        await db.delete(lineItems).where(inArray(lineItems.invoiceId, invoiceIds));
        await db.delete(feedbackLogs).where(inArray(feedbackLogs.invoiceId, invoiceIds));
        await db.delete(approvals).where(inArray(approvals.invoiceId, invoiceIds));
        await db.delete(invoicePoMatches).where(inArray(invoicePoMatches.invoiceId, invoiceIds));
        await db.delete(invoiceProjectMatches).where(inArray(invoiceProjectMatches.invoiceId, invoiceIds));

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
  async getSetting(key: string): Promise<Setting | null> {
    try {
      const [setting] = await db.select().from(settings).where(eq(settings.key, key));

      if (!setting) {
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
              timezone: 'America/New_York'
            }),
            description: 'User preferences and settings'
          }
        };
        return defaultSettings[key] || null;
      }

      return setting;
    } catch (error) {
      console.error('Error in getSetting:', error);
      return null;
    }
  }

  async updateSetting(key: string, value: string): Promise<Setting> {
    try {
      const [setting] = await db.insert(settings).values({
        key,
        value,
        description: 'Setting updated',
        updatedAt: new Date()
      }).onConflictDoUpdate({
        target: settings.key,
        set: {
          value,
          updatedAt: new Date()
        }
      }).returning();

      return setting;
    } catch (error) {
      console.error('Error in updateSetting:', error);
      throw error;
    }
  }

  async setSetting(setting: { key: string; value: string; description: string }): Promise<Setting> {
    try {
      const [result] = await db.insert(settings).values({
        ...setting,
        updatedAt: new Date()
      }).onConflictDoUpdate({
        target: settings.key,
        set: {
          value: setting.value,
          description: setting.description,
          updatedAt: new Date()
        }
      }).returning();

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


  async getValidationRules(): Promise<ValidationRule[]> {
    try {
      const rules = await db.select().from(validationRules).orderBy(desc(validationRules.createdAt));
      console.log('Retrieved validation rules from database:', rules.length, 'rules');
      return rules;
    } catch (error) {
      console.error('Database error fetching validation rules:', error);
      throw error;
    }
  }

  async getValidationRule(id: number): Promise<ValidationRule | null> {
    try {
      // Ensure id is a valid number
      const ruleId = parseInt(String(id));
      if (isNaN(ruleId)) {
        console.error('Invalid validation rule ID provided:', id);
        return null;
      }

      const [rule] = await db.select().from(validationRules).where(eq(validationRules.id, ruleId));
      return rule || null;
    } catch (error) {
      console.error('Database error fetching validation rule:', error);
      throw error;
    }
  }

  async createValidationRule(ruleData: InsertValidationRule): Promise<ValidationRule> {
    console.log('Creating validation rule in database:', ruleData);

    try {
      const [rule] = await db.insert(validationRules).values(ruleData).returning();
      console.log('Successfully created validation rule:', rule);
      return rule;
    } catch (error) {
      console.error('Database error creating validation rule:', error);
      throw error;
    }
  }

  async updateValidationRule(id: number, updates: Partial<InsertValidationRule>): Promise<ValidationRule> {
    try {
      const [rule] = await db.update(validationRules).set({
        ...updates,
        updatedAt: new Date()
      }).where(eq(validationRules.id, id)).returning();
      return rule;
    } catch (error) {
      console.error('Database error updating validation rule:', error);
      throw error;
    }
  }

  async deleteValidationRule(id: number): Promise<void> {
    try {
      await db.delete(validationRules).where(eq(validationRules.id, id));
    } catch (error) {
      console.error('Database error deleting validation rule:', error);
      throw error;
    }
  }

  async validateInvoiceData(invoiceData: any): Promise<any> {
    console.log('🔍 Starting invoice validation for:', {
      vendor: invoiceData.vendorName,
      invoiceNumber: invoiceData.invoiceNumber,
      amount: invoiceData.totalAmount,
      extractedData: invoiceData.extractedData?.buyerTaxId
    });

    try {
      // Get active validation rules from database
      const rules = await this.getValidationRules();
      const activeRules = rules.filter(rule => rule.isActive);

      console.log(`📋 Found ${activeRules.length} active validation rules`);

      const violations: any[] = [];
      const warnings: any[] = [];
      let validationScore = 1.0; // Start with perfect score

      // Validate each rule
      for (const rule of activeRules) {
        try {
          const result = await this.validateSingleRule(invoiceData, rule);

          if (!result.isValid) {
            const violation = {
              ruleId: rule.id,
              fieldName: rule.fieldName,
              ruleType: rule.ruleType,
              expected: rule.ruleValue,
              actual: result.actualValue,
              severity: rule.severity,
              message: result.message,
              timestamp: new Date().toISOString()
            };

            if (rule.severity === 'high' || rule.severity === 'critical') {
              violations.push(violation);
              validationScore -= 0.2; // Reduce score for critical violations
            } else if (rule.severity === 'medium') {
              violations.push(violation);
              validationScore -= 0.15; // Reduce score for medium violations
            } else if (rule.severity === 'low') {
              warnings.push(violation);
              validationScore -= 0.1; // Reduce score less for low severity
            } else {
              warnings.push(violation);
              validationScore -= 0.05; // Minimal reduction for other cases
            }

            console.log(`❌ Validation failed for rule ${rule.id} (${rule.fieldName}):`, {
              expected: rule.ruleValue,
              actual: result.actualValue,
              severity: rule.severity
            });
          } else {
            console.log(`✅ Validation passed for rule ${rule.id} (${rule.fieldName})`);
          }
        } catch (ruleError) {
          console.error(`Error validating rule ${rule.id}:`, ruleError);
          // Continue with other rules even if one fails
        }
      }

      // Ensure score doesn't go below 0
      validationScore = Math.max(0, validationScore);

      const isValid = violations.length === 0;
      const finalResult = {
        isValid,
        validationScore,
        violations,
        warnings,
        totalRulesChecked: activeRules.length,
        criticalViolations: violations.filter(v => v.severity === 'high' || v.severity === 'critical').length,
        mediumViolations: violations.filter(v => v.severity === 'medium').length,
        warningCount: warnings.length,
        status: isValid ? 'passed' : 'failed',
        timestamp: new Date().toISOString()
      };

      console.log('🏁 Validation completed:', {
        isValid,
        validationScore: validationScore.toFixed(2),
        violations: violations.length,
        warnings: warnings.length
      });

      return finalResult;

    } catch (error) {
      console.error('❌ Error during invoice validation:', error);
      return {
        isValid: false,
        validationScore: 0,
        violations: [{
          ruleId: null,
          fieldName: 'system',
          ruleType: 'system_error',
          expected: 'successful_validation',
          actual: 'validation_error',
          severity: 'critical',
          message: `Validation system error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: new Date().toISOString()
        }],
        warnings: [],
        totalRulesChecked: 0,
        criticalViolations: 1,
        mediumViolations: 0,
        warningCount: 0,
        status: 'system_error',
        timestamp: new Date().toISOString()
      };
    }
  }

  // Enhanced method to get specific invoice with detailed analysis
  async getInvoiceWithAnalysis(invoiceId: number): Promise<any> {
    try {
      const invoice = await this.getInvoice(invoiceId);
      if (!invoice) return null;

      // Add analysis for debugging purposes
      const analysis = {
        hasValidVendor: !!invoice.vendorName,
        hasValidInvoiceNumber: !!invoice.invoiceNumber,
        hasValidAmount: !!(invoice.totalAmount && parseFloat(invoice.totalAmount.toString()) > 0),
        hasValidDate: !!invoice.invoiceDate,
        extractedFieldsCount: invoice.extractedData ? Object.keys(invoice.extractedData).length : 0,
        processingHistory: {
          uploadedAt: invoice.createdAt,
          status: invoice.status,
          validationStatus: invoice.validationStatus,
          lastUpdated: invoice.updatedAt
        }
      };

      return { ...invoice, analysis };
    } catch (error) {
      console.error('Error getting invoice with analysis:', error);
      throw error;
    }
  }

  // Helper method to validate a single rule
  private async validateSingleRule(invoiceData: any, rule: any): Promise<{ isValid: boolean; actualValue: any; message: string }> {
    // Get the field value using dot notation (e.g., "extractedData.buyerTaxId")
    const fieldValue = this.getNestedFieldValue(invoiceData, rule.fieldName);

    console.log(`🔍 Validating rule ${rule.id} (${rule.ruleType}) for field ${rule.fieldName}:`, {
      expected: rule.ruleValue,
      actual: fieldValue
    });

    switch (rule.ruleType) {
      case 'required':
        const isRequired = fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
        return {
          isValid: isRequired,
          actualValue: fieldValue,
          message: isRequired ? 'Field is present' : `Required field ${rule.fieldName} is missing`
        };

      case 'enum':
        // For enum rules, check if the value is in the list of allowed values
        // Support both single values and comma-separated multiple values
        const allowedValues = rule.ruleValue.split(',').map((v: string) => v.trim());
        const enumValid = allowedValues.includes(String(fieldValue));
        return {
          isValid: enumValid,
          actualValue: fieldValue,
          message: enumValid 
            ? 'Field value matches allowed values' 
            : `Field ${rule.fieldName} must be one of [${allowedValues.join(', ')}] but got "${fieldValue}"`
        };

      case 'regex':
        if (!fieldValue) {
          return {
            isValid: false,
            actualValue: fieldValue,
            message: `Field ${rule.fieldName} is empty, cannot validate regex pattern`
          };
        }
        try {
          const regex = new RegExp(rule.ruleValue);
          const regexValid = regex.test(String(fieldValue));
          return {
            isValid: regexValid,
            actualValue: fieldValue,
            message: regexValid 
              ? 'Field matches required pattern' 
              : `Field ${rule.fieldName} does not match required pattern: ${rule.ruleValue}`
          };
        } catch (regexError) {
          return {
            isValid: false,
            actualValue: fieldValue,
            message: `Invalid regex pattern in rule: ${rule.ruleValue}`
          };
        }

      case 'range':
        try {
          const numValue = parseFloat(String(fieldValue));
          const [min, max] = rule.ruleValue.split('-').map((n: string) => parseFloat(n.trim()));

          if (isNaN(numValue)) {
            return {
              isValid: false,
              actualValue: fieldValue,
              message: `Field ${rule.fieldName} is not a valid number`
            };
          }

          const rangeValid = numValue >= min && numValue <= max;
          return {
            isValid: rangeValid,
            actualValue: fieldValue,
            message: rangeValid 
              ? `Value is within range ${min}-${max}` 
              : `Field ${rule.fieldName} value ${numValue} is outside allowed range ${min}-${max}`
          };
        } catch (rangeError) {
          return {
            isValid: false,
            actualValue: fieldValue,
            message: `Invalid range format in rule: ${rule.ruleValue}`
          };
        }

      case 'format':
        // Custom format validation (e.g., email, phone, date formats)
        return this.validateFormat(fieldValue, rule.ruleValue, rule.fieldName);

      default:
        console.warn(`Unknown rule type: ${rule.ruleType}`);
        return {
          isValid: true,
          actualValue: fieldValue,
          message: `Unknown rule type: ${rule.ruleType}, skipping validation`
        };
    }
  }

  // Helper method to get nested field values (e.g., "extractedData.buyerTaxId")
  private getNestedFieldValue(obj: any, fieldPath: string): any {
    return fieldPath.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : null;
    }, obj);
  }

  // Helper method for format validation
  private validateFormat(value: any, format: string, fieldName: string): { isValid: boolean; actualValue: any; message: string } {
    if (!value) {
      return {
        isValid: false,
        actualValue: value,
        message: `Field ${fieldName} is empty, cannot validate format`
      };
    }

    const stringValue = String(value);

    switch (format.toLowerCase()) {
      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const emailValid = emailRegex.test(stringValue);
        return {
          isValid: emailValid,
          actualValue: value,
          message: emailValid ? 'Valid email format' : `Field ${fieldName} is not a valid email format`
        };

      case 'nit':
      case 'colombian_nit':
        // Colombian NIT format validation (e.g., 860527800-1 or 860527800)
        const nitRegex = /^\d{9,10}(-\d)?$/;
        const nitValid = nitRegex.test(stringValue);
        return {
          isValid: nitValid,
          actualValue: value,
          message: nitValid ? 'Valid Colombian NIT format' : `Field ${fieldName} is not a valid Colombian NIT format`
        };

      case 'date':
        const dateValid = !isNaN(Date.parse(stringValue));
        return {
          isValid: dateValid,
          actualValue: value,
          message: dateValid ? 'Valid date format' : `Field ${fieldName} is not a valid date format`
        };

      default:
        return {
          isValid: true,
          actualValue: value,
          message: `Unknown format type: ${format}, skipping validation`
        };
    }
  }

  async validateAllApprovedInvoices(): Promise<any> {
    try {
      console.log('🔍 Starting bulk validation of approved invoices...');

      // Get all approved invoices
      const approvedInvoices = await db
        .select()
        .from(invoices)
        .where(eq(invoices.status, 'approved'))
        .orderBy(desc(invoices.createdAt));

      console.log(`📋 Found ${approvedInvoices.length} approved invoices for validation`);

      const invoiceValidations = [];
      let verified = 0;
      let flagged = 0;
      let needsReview = 0;

      for (const invoice of approvedInvoices) {
        try {
          // Validate each invoice
          const validationResult = await this.validateInvoiceData({
            vendorName: invoice.vendorName,
            invoiceNumber: invoice.invoiceNumber,
            totalAmount: parseFloat(invoice.totalAmount?.toString() || '0'),
            taxAmount: parseFloat(invoice.taxAmount?.toString() || '0'),
            invoiceDate: invoice.invoiceDate,
            dueDate: invoice.dueDate,
            currency: invoice.currency || 'USD',
            extractedData: invoice.extractedData
          });

          const result = {
            invoiceId: invoice.id,
            fileName: invoice.fileName,
            vendorName: invoice.vendorName,
            invoiceNumber: invoice.invoiceNumber,
            totalAmount: invoice.totalAmount,
            isValid: validationResult.isValid,
            validationScore: validationResult.validationScore,
            violations: validationResult.violations,
            warnings: validationResult.warnings,
            status: validationResult.status,
            timestamp: new Date().toISOString()
          };

          invoiceValidations.push(result);

          if (validationResult.isValid) {
            verified++;
          } else if ((validationResult.criticalViolations || 0) > 0) {
            flagged++;
          } else {
            needsReview++;
          }

          // Update validation status in database
          await db.update(invoices)
            .set({
              validationStatus: validationResult.isValid ? 'validated' : 'failed',
              validationResults: validationResult,
              validationScore: validationResult.validationScore.toString(),
              isValidated: true,
              validatedAt: new Date(),
              updatedAt: new Date()
            })
            .where(eq(invoices.id, invoice.id));

        } catch (invoiceError) {
          console.error(`Error validating invoice ${invoice.id}:`, invoiceError);

          invoiceValidations.push({
            invoiceId: invoice.id,
            fileName: invoice.fileName,
            vendorName: invoice.vendorName,
            invoiceNumber: invoice.invoiceNumber,
            totalAmount: invoice.totalAmount,
            isValid: false,
            validationScore: 0,
            violations: [{
              ruleId: null,
              fieldName: 'system',
              severity: 'critical',
              message: `Validation error: ${invoiceError instanceof Error ? invoiceError.message : 'Unknown error'}`,
              timestamp: new Date().toISOString()
            }],
            warnings: [],
            status: 'system_error',
            timestamp: new Date().toISOString()
          });

          flagged++;
        }
      }

      const result = {
        totalInvoices: approvedInvoices.length,
        verified,
        flagged,
        needsReview,
        pending: approvedInvoices.length - verified - flagged - needsReview,
        invoiceValidations
      };

      console.log('🏁 Bulk validation completed:', {
        total: result.totalInvoices,
        verified: result.verified,
        flagged: result.flagged,
        needsReview: result.needsReview
      });

      return result;

    } catch (error) {
      console.error('❌ Error in validateAllApprovedInvoices:', error);
      return {
        totalInvoices: 0,
        verified: 0,
        flagged: 0,
        needsReview: 0,
        pending: 0,
        invoiceValidations: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Petty Cash Log methods
  async createPettyCashLog(log: any): Promise<any> {
    try {
      const { pettyCashLog } = await import('@shared/schema');
      const [result] = await db.insert(pettyCashLog).values(log).returning();
      return result;
    } catch (error) {
      console.error('Error creating petty cash log:', error);
      throw error;
    }
  }

  async updatePettyCashLog(id: number, updates: any): Promise<any> {
    try {
      const { pettyCashLog } = await import('@shared/schema');
      const [result] = await db.update(pettyCashLog)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(pettyCashLog.id, id))
        .returning();
      return result;
    } catch (error) {
      console.error('Error updating petty cash log:', error);
      throw error;
    }
  }

  async getPettyCashLogs(status?: string): Promise<any[]> {
    try {
      const { pettyCashLog, invoices } = await import('@shared/schema');
      let query = db.select({
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
        invoice: {
          id: invoices.id,
          vendorName: invoices.vendorName,
          invoiceNumber: invoices.invoiceNumber,
          totalAmount: invoices.totalAmount,
          fileName: invoices.fileName,
          createdAt: invoices.createdAt,
        }
      }).from(pettyCashLog).innerJoin(invoices, eq(pettyCashLog.invoiceId, invoices.id));

      if (status) {
        query = query.where(eq(pettyCashLog.status, status as any));
      }

      return await query.orderBy(desc(pettyCashLog.createdAt));
    } catch (error) {
      console.error('Error getting petty cash logs:', error);
      return [];
    }
  }

  async getPettyCashLogByInvoiceId(invoiceId: number): Promise<any> {
    try {
      const { pettyCashLog, invoices } = await import('@shared/schema');
      const [result] = await db.select({
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
        invoice: {
          id: invoices.id,
          vendorName: invoices.vendorName,
          invoiceNumber: invoices.invoiceNumber,
          totalAmount: invoices.totalAmount,
          fileName: invoices.fileName,
          createdAt: invoices.createdAt,
        }
      }).from(pettyCashLog).innerJoin(invoices, eq(pettyCashLog.invoiceId, invoices.id))
        .where(eq(pettyCashLog.invoiceId, invoiceId));
      return result || null;
    } catch (error) {
      console.error('Error getting petty cash log by invoice ID:', error);
      return null;
    }
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

  async assignProjectToInvoice(invoiceId: number, projectId: number): Promise<void> {
    // Placeholder implementation
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

  async findPotentialProjectMatches(invoiceId: number): Promise<any[]> {
    return [];
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

  async getClassificationKeywords(): Promise<ClassificationKeyword[]> {
    await ensureDbConnected();
    if (!isDbConnected || !db) {
      return fallbackStorage?.getClassificationKeywords() || [];
    }
    return await db.select().from(classificationKeywords);
  }

  async addClassificationKeyword(keyword: InsertClassificationKeyword): Promise<ClassificationKeyword> {
    await ensureDbConnected();
    if (!isDbConnected || !db) {
      return fallbackStorage?.addClassificationKeyword(keyword) || { id: Date.now(), ...keyword, createdAt: new Date(), updatedAt: new Date() } as ClassificationKeyword;
    }
    const [result] = await db.insert(classificationKeywords).values({
      ...keyword,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return result;
  }

  async removeClassificationKeyword(id: number): Promise<void> {
    await ensureDbConnected();
    if (!isDbConnected || !db) {
      return fallbackStorage?.removeClassificationKeyword(id);
    }
    await db.delete(classificationKeywords).where(eq(classificationKeywords.id, id));
  }

  async getLineItemClassifications(): Promise<LineItemClassification[]> {
    await ensureDbConnected();
    if (!isDbConnected || !db) {
      return fallbackStorage?.getLineItemClassifications() || [];
    }
    return await db.select().from(lineItemClassifications);
  }

  async getLineItemClassificationsByInvoice(invoiceId: number): Promise<LineItemClassification[]> {
    await ensureDbConnected();
    if (!isDbConnected || !db) {
      return fallbackStorage?.getLineItemClassifications() || [];
    }
    return await db.select().from(lineItemClassifications).where(eq(lineItemClassifications.invoiceId, invoiceId));
  }

  async createLineItemClassification(data: InsertLineItemClassification): Promise<LineItemClassification> {
    await ensureDbConnected();
    if (!isDbConnected || !db) {
      return fallbackStorage?.updateLineItemClassification(Date.now(), data) || { id: Date.now(), ...data, createdAt: new Date(), updatedAt: new Date() } as LineItemClassification;
    }
    const [result] = await db.insert(lineItemClassifications).values({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    return result;
  }

  async updateLineItemClassification(id: number, updates: Partial<InsertLineItemClassification>): Promise<LineItemClassification> {
    await ensureDbConnected();
    if (!isDbConnected || !db) {
      return fallbackStorage?.updateLineItemClassification(id, updates) || { id, ...updates, updatedAt: new Date() } as LineItemClassification;
    }
    const [result] = await db.update(lineItemClassifications).set({
      ...updates,
      updatedAt: new Date()
    }).where(eq(lineItemClassifications.id, id)).returning();
    return result;
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
        skippedInvoices: invoiceImporterLogs.skippedInvoices,
        processedInvoices: invoiceImporterLogs.processedInvoices,
        successfulImports: invoiceImporterLogs.successfulImports,
        failedImports: invoiceImporterLogs.failedImports,
        fileType: invoiceImporterConfigs.fileTypes,
        logs: invoiceImporterLogs.logs,
        errorMessage: invoiceImporterLogs.errorMessage,
        createdAt: invoiceImporterLogs.createdAt,
        triggeredBy: sql<string>`
          CASE 
            WHEN ${invoiceImporterConfigs.scheduleType} = 'manual' THEN 'Manual'
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
}

// Storage factory that returns appropriate storage based on connection status
function createStorage(): IStorage {
  if (isDbConnected && db) {
    console.log("✅ Using PostgreSQL database storage");
    return new PostgresStorage();
  } else if (fallbackStorage) {
    console.log("⚠️ Using fallback storage due to database connection issues");
    return fallbackStorage;
  } else {
    console.log("⚠️ Creating new fallback storage as last resort");
    return new FallbackStorage();
  }
}

// Async storage factory that waits for database initialization
export async function getStorage(): Promise<IStorage> {
  await ensureDbConnected();
  return createStorage();
}

// Create a storage proxy that properly initializes the database before each call
let storageInstance: IStorage | null = null;
let initializationPromise: Promise<IStorage> | null = null;

// Get or create the storage instance
export async function getStorageInstance(): Promise<IStorage> {
  if (!storageInstance) {
    if (!initializationPromise) {
      initializationPromise = (async () => {
        await ensureDbConnected();
        storageInstance = createStorage();
        return storageInstance;
      })();
    }
    await initializationPromise;
  }
  return storageInstance!;
}

// Create a proxy that automatically initializes the database before each call
export const storage: IStorage = new Proxy({} as IStorage, {
  get(target, prop: string | symbol) {
    return async (...args: any[]) => {
      const realStorage = await getStorageInstance();
      const method = (realStorage as any)[prop];
      if (typeof method === 'function') {
        return method.apply(realStorage, args);
      }
      return method;
    };
  }
});

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
      .where(gte(invoices.uploadedAt, yesterday));
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
      .where(eq(invoices.status, status))
      .orderBy(desc(invoices.uploadedAt))
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
      .orderBy(desc(invoices.uploadedAt))
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

export async function createLineItem(lineItemData: any) {
  try {
    const db = await getDb();
    const result = await db.insert(lineItems).values({
      invoiceId: lineItemData.invoiceId,
      lineNumber: lineItemData.lineIndex,
      description: lineItemData.description,
      quantity: lineItemData.quantity?.toString(),
      unitPrice: lineItemData.unitPrice?.toString(),
      totalPrice: lineItemData.amount?.toString(),
      unit: lineItemData.unit,
      rawText: JSON.stringify(lineItemData)
    }).returning();
    
    return result[0];
  } catch (error) {
    console.error('Error creating line item:', error);
    throw error;
  }
}

// End of PostgresStorage class implementation