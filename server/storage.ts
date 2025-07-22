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
import { eq, desc, sql, and, or, ilike, isNull } from "drizzle-orm";

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
  getValidationRules(): Promise<any[]>;
  getValidationRule(id: number): Promise<any>;
  createValidationRule(rule: any): Promise<any>;
  updateValidationRule(id: number, updates: any): Promise<any>;
  deleteValidationRule(id: number): Promise<void>;
  validateInvoiceData(invoiceData: any): Promise<any>;
  validateAllApprovedInvoices(): Promise<any>;

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
  getInvoiceImporterConfig(id: number): Promise<InvoiceImporterConfig | null>;
  updateInvoiceImporterConfig(id: number, updates: Partial<InsertInvoiceImporterConfig>): Promise<void>;
  deleteInvoiceImporterConfig(id: number): Promise<void>;

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
    return await db.select().from(invoices)
      .where(eq(invoices.userId, userId))
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

  async updateErpConnection(id: number, updates: Partial<InsertErpConnection>): Promise<void> {
    await db.update(erpConnections).set({
      ...updates,
      updatedAt: new Date()
    }).where(eq(erpConnections.id, id));
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

  async createInvoiceImporterLog(log: InsertInvoiceImporterLog): Promise<InvoiceImporterLog> {
    const [result] = await db.insert(invoiceImporterLogs).values(log).returning();
    return result;
  }

  async getInvoiceImporterLogs(): Promise<InvoiceImporterLog[]> {
    return await db.select().from(invoiceImporterLogs).orderBy(desc(invoiceImporterLogs.createdAt));
  }

  async createImportedInvoice(invoice: InsertImportedInvoice): Promise<ImportedInvoice> {
    const [result] = await db.insert(importedInvoices).values(invoice).returning();
    return result;
  }

  async getImportedInvoices(): Promise<ImportedInvoice[]> {
    return await db.select().from(importedInvoices).orderBy(desc(importedInvoices.createdAt));
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
      // First delete related line items
      const userInvoices = await db.select({ id: invoices.id }).from(invoices)
        .where(eq(invoices.userId, userId));
      
      let deletedCount = 0;
      for (const invoice of userInvoices) {
        await db.delete(lineItems).where(eq(lineItems.invoiceId, invoice.id));
        deletedCount++;
      }

      // Then delete the invoices
      await db.delete(invoices).where(eq(invoices.userId, userId));
      
      return deletedCount;
    } catch (error) {
      console.error('Error in deleteAllUserInvoices:', error);
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

  // Additional methods for complete interface compatibility
  async getInvoicesWithProjectMatches(userId: string): Promise<any[]> {
    return await this.getInvoicesByUserId(userId);
  }

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

  async getInvoiceImporterLog(id: number): Promise<any> {
    const [result] = await db.select().from(invoiceImporterLogs).where(eq(invoiceImporterLogs.id, id));
    return result || null;
  }
}

export const storage: IStorage = new PostgresStorage();