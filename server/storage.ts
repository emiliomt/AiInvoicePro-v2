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
}

export const storage: IStorage = new PostgresStorage();