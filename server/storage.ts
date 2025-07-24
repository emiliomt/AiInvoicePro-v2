import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
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
  erpConnections,
  invoiceImporterConfigs,
  invoiceImporterLogs,
  importedInvoices,
  erpTasks,
  savedWorkflows,
  scheduledTasks,
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
import { eq, desc, sql, and, or, ilike, isNull, inArray } from "drizzle-orm";

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
  getClassificationKeywords(): Promise<any[]>;
  addClassificationKeyword(keyword: any): Promise<any>;
  removeClassificationKeyword(id: number): Promise<void>;
  getLineItemClassifications(): Promise<any[]>;
  updateLineItemClassification(id: number, updates: any): Promise<any>;
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
    return await db.select().from(invoices).orderBy(desc(invoices.createdAt));
  }

  async updateInvoice(id: number, updates: Partial<InsertInvoice>): Promise<void> {
    await db.update(invoices).set({
      ...updates,
      updatedAt: new Date()
    }).where(eq(invoices.id, id));
  }

  async deleteInvoice(id: number): Promise<void> {
    // Delete related line items first
    await db.delete(lineItems).where(eq(lineItems.invoiceId, id));
    // Then delete the invoice
    await db.delete(invoices).where(eq(invoices.id, id));
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

  async getErpConnections(): Promise<ErpConnection[]> {
    return await db.select().from(erpConnections).orderBy(desc(erpConnections.createdAt));
  }

  async updateErpConnection(id: number, updates: Partial<InsertErpConnection>): Promise<ErpConnection> {
    await db.update(erpConnections).set({
      ...updates,
      updatedAt: new Date()
    }).where(eq(erpConnections.id, id));

    // Return the updated connection
    const [result] = await db.select().from(erpConnections).where(eq(erpConnections.id, id));
    if (!result) {
      throw new Error('Connection not found after update');
    }
    return result;
  }

  async deleteErpConnection(id: number): Promise<void> {
    await db.delete(erpConnections).where(eq(erpConnections.id, id));
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
      // First get count for return value
      const userInvoices = await db
        .select({ count: sql<number>`count(*)` })
        .from(invoices)
        .where(eq(invoices.userId, userId));

      const count = userInvoices[0]?.count || 0;

      if (count > 0) {
        // Delete line items first
        await db
          .delete(lineItems)
          .where(
            inArray(
              lineItems.invoiceId,
              db.select({ id: invoices.id }).from(invoices).where(eq(invoices.userId, userId))
            )
          );

        // Delete approvals
        await db
          .delete(approvals)
          .where(
            inArray(
              approvals.invoiceId,
              db.select({ id: invoices.id }).from(invoices).where(eq(invoices.userId, userId))
            )
          );

        // Delete invoice flags
        // await db
        //   .delete(invoiceFlags)
        //   .where(
        //     inArray(
        //       invoiceFlags.invoiceId,
        //       db.select({ id: invoices.id }).from(invoices).where(eq(invoices.userId, userId))
        //     )
        //   );

        // Delete invoice-PO matches
        await db
          .delete(invoicePoMatches)
          .where(
            inArray(
              invoicePoMatches.invoiceId,
              db.select({ id: invoices.id }).from(invoices).where(eq(invoices.userId, userId))
            )
          );

        // Delete invoice-project matches
        await db
          .delete(invoiceProjectMatches)
          .where(
            inArray(
              invoiceProjectMatches.invoiceId,
              db.select({ id: invoices.id }).from(invoices).where(eq(invoices.userId, userId))
            )
          );

        // Delete feedback logs
        // await db
        //   .delete(feedbackLogs)
        //   .where(
        //     inArray(
        //       feedbackLogs.invoiceId,
        //       db.select({ id: invoices.id }).from(invoices).where(eq(invoices.userId, userId))
        //     )
        //   );

        // Finally delete the invoices
        await db.delete(invoices).where(eq(invoices.userId, userId));
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
  async getSetting(key: string): Promise<any> {
    try {
      // For now, return default settings
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
    } catch (error) {
      console.error('Error in getSetting:', error);
      return null;
    }
  }

  async updateSetting(key: string, value: string): Promise<any> {
    try {
      // For now, just return the setting object
      return { key, value, description: 'Setting updated' };
    } catch (error) {
      console.error('Error in updateSetting:', error);
      throw error;
    }
  }

  async setSetting(setting: { key: string; value: string; description: string }): Promise<any> {
    try {
      return setting;
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
          matches: sql<any[]>`
            COALESCE(
              json_agg(
                json_build_object(
                  'id', ${invoiceProjectMatches.id},
                  'projectId', ${invoiceProjectMatches.projectId},
                  'matchScore', ${invoiceProjectMatches.matchScore},
                  'status', ${invoiceProjectMatches.status},
                  'matchDetails', ${invoiceProjectMatches.matchDetails},
                  'isActive', ${invoiceProjectMatches.isActive},
                  'project', json_build_object(
                    'projectId', ${projects.projectId},
                    'name', ${projects.name},
                    'city', ${projects.city},
                    'address', ${projects.address}
                  )
                )
              ) FILTER (WHERE ${invoiceProjectMatches.id} IS NOT NULL),
              '[]'::json
            )
          `
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
          matches: sql<any[]>`
            COALESCE(
              json_agg(
                json_build_object(
                  'id', ${invoiceProjectMatches.id},
                  'projectId', ${invoiceProjectMatches.projectId},
                  'matchScore', ${invoiceProjectMatches.matchScore},
                  'status', ${invoiceProjectMatches.status},
                  'matchDetails', ${invoiceProjectMatches.matchDetails},
                  'isActive', ${invoiceProjectMatches.isActive},
                  'project', json_build_object(
                    'projectId', ${projects.projectId},
                    'name', ${projects.name},
                    'city', ${projects.city},
                    'address', ${projects.address}
                  )
                )
              ) FILTER (WHERE ${invoiceProjectMatches.id} IS NOT NULL),
              '[]'::json
            )
          `
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

  // Missing methods implementations
  async createPettyCashLog(log: any): Promise<any> {
    return { id: Date.now(), ...log, createdAt: new Date() };
  }

  async updatePettyCashLog(id: number, updates: any): Promise<any> {
    return { id, ...updates, updatedAt: new Date() };
  }

  async getPettyCashLogs(status?: string): Promise<any[]> {
    return [];
  }

  async getPettyCashLogByInvoiceId(invoiceId: number): Promise<any> {
    return null;
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

  async getClassificationKeywords(): Promise<any[]> {
    return [];
  }

  async addClassificationKeyword(keyword: any): Promise<any> {
    return { id: Date.now(), ...keyword, createdAt: new Date() };
  }

  async removeClassificationKeyword(id: number): Promise<void> {
    // Placeholder implementation
  }

  async getLineItemClassifications(): Promise<any[]> {
    return [];
  }

  async updateLineItemClassification(id: number, updates: any): Promise<any> {
    return { id, ...updates, updatedAt: new Date() };
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
}

export const storage: IStorage = new PostgresStorage();