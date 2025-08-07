// Temporary fallback storage for when database connection fails
import type { IStorage } from "./storage";
import type {
  Invoice,
  InsertInvoice,
  LineItem,
  InsertLineItem,
  Approval,
  InsertApproval,
  Company,
  InsertCompany,
  User,
  UpsertUser,
  Project,
  InsertProject,
  PurchaseOrder,
  InsertPurchaseOrder,
  InvoicePoMatch,
  InsertInvoicePoMatch,
  InvoiceProjectMatch,
  InsertInvoiceProjectMatch,
  ValidationRule,
  InsertValidationRule,
  InvoiceImporterConfig,
  InsertInvoiceImporterConfig,
  InvoiceImporterLog,
  InsertInvoiceImporterLog,
  ImportedInvoice,
  InsertImportedInvoice,
  ErpConnection,
  InsertErpConnection,
  ErpTask,
  InsertErpTask,
  SavedWorkflow,
  InsertSavedWorkflow,
  ScheduledTask,
  InsertScheduledTask,
} from "@shared/schema";

class FallbackStorage implements IStorage {
  private data = {
    companies: [] as Company[],
    users: [] as User[],
    invoices: [] as Invoice[],
    lineItems: [] as LineItem[],
    approvals: [] as Approval[],
    projects: [] as Project[],
    purchaseOrders: [] as PurchaseOrder[],
    invoicePoMatches: [] as InvoicePoMatch[],
    invoiceProjectMatches: [] as InvoiceProjectMatch[],
    validationRules: [] as ValidationRule[],
    erpConnections: [] as ErpConnection[],
    invoiceImporterConfigs: [] as InvoiceImporterConfig[],
    invoiceImporterLogs: [] as InvoiceImporterLog[],
    importedInvoices: [] as ImportedInvoice[],
    erpTasks: [] as ErpTask[],
    savedWorkflows: [] as SavedWorkflow[],
    scheduledTasks: [] as ScheduledTask[],
    settings: [] as any[],
    pettyCashLogs: [] as any[],
    feedbackLogs: [] as any[],
  };

  private nextId = 1;

  // Companies
  async createCompany(company: InsertCompany): Promise<Company> {
    const newCompany = { ...company, id: this.nextId++ } as Company;
    this.data.companies.push(newCompany);
    return newCompany;
  }

  async getCompany(id: number): Promise<Company | null> {
    return this.data.companies.find(c => c.id === id) || null;
  }

  async getCompanies(): Promise<Company[]> {
    return this.data.companies;
  }

  async updateCompany(id: number, updates: Partial<InsertCompany>): Promise<void> {
    const index = this.data.companies.findIndex(c => c.id === id);
    if (index >= 0) {
      this.data.companies[index] = { ...this.data.companies[index], ...updates };
    }
  }

  // Users
  async upsertUser(user: UpsertUser): Promise<User> {
    const existing = this.data.users.find(u => u.id === user.id);
    if (existing) {
      const updated = { ...existing, ...user };
      const index = this.data.users.findIndex(u => u.id === user.id);
      this.data.users[index] = updated;
      return updated;
    } else {
      const newUser = { ...user } as User;
      this.data.users.push(newUser);
      return newUser;
    }
  }

  async getUser(id: string): Promise<User | null> {
    return this.data.users.find(u => u.id === id) || null;
  }

  async getUsers(): Promise<User[]> {
    return this.data.users;
  }

  // Invoices
  async createInvoice(invoice: InsertInvoice): Promise<Invoice> {
    const newInvoice = { 
      ...invoice, 
      id: this.nextId++,
      createdAt: new Date(),
      updatedAt: new Date()
    } as Invoice;
    this.data.invoices.push(newInvoice);
    return newInvoice;
  }

  async getInvoice(id: number): Promise<Invoice | null> {
    return this.data.invoices.find(i => i.id === id) || null;
  }

  async getInvoices(): Promise<Invoice[]> {
    return this.data.invoices;
  }

  async updateInvoice(id: number, updates: Partial<InsertInvoice>): Promise<void> {
    const index = this.data.invoices.findIndex(i => i.id === id);
    if (index >= 0) {
      this.data.invoices[index] = { 
        ...this.data.invoices[index], 
        ...updates,
        updatedAt: new Date()
      };
    }
  }

  async deleteInvoice(id: number): Promise<void> {
    this.data.invoices = this.data.invoices.filter(i => i.id !== id);
  }

  async getInvoicesByUserId(userId: string): Promise<Invoice[]> {
    return this.data.invoices.filter(i => i.userId === userId);
  }

  async getInvoicesByCompanyId(companyId: number): Promise<Invoice[]> {
    return this.data.invoices.filter(i => i.companyId === companyId);
  }

  async getInvoicesByIds(invoiceIds: number[]): Promise<Invoice[]> {
    return this.data.invoices.filter(i => invoiceIds.includes(i.id));
  }

  async getInvoicesByFileName(baseFileName: string): Promise<Invoice[]> {
    return this.data.invoices.filter(i => i.fileName?.includes(baseFileName));
  }

  // Validation Rules
  async getValidationRules(): Promise<ValidationRule[]> {
    // Return some basic validation rules for testing
    return [
      {
        id: 1,
        name: "NIT Validation",
        description: "Colombian NIT format validation",
        fieldName: "extractedData.buyerTaxId",
        ruleType: "enum" as const,
        ruleValue: "86052780-0",
        severity: "critical" as const,
        isActive: true,
        errorMessage: "Buyer Tax ID must match expected format",
        createdAt: new Date(),
        updatedAt: new Date(),
        ruleData: null
      }
    ];
  }

  async validateInvoiceData(invoiceData: any): Promise<any> {
    const rules = await this.getValidationRules();
    const violations = [];
    const warnings = [];
    
    for (const rule of rules) {
      if (!rule.isActive) continue;
      
      const fieldPath = rule.fieldName.split('.');
      let value = invoiceData;
      for (const key of fieldPath) {
        value = value?.[key];
      }
      
      if (rule.ruleType === 'enum' && value !== rule.ruleValue) {
        violations.push({
          field: rule.fieldName,
          message: rule.errorMessage || `Invalid value for ${rule.fieldName}`,
          expected: rule.ruleValue,
          actual: value,
          severity: rule.severity
        });
      }
    }
    
    const validationScore = violations.length > 0 ? 0.0 : 1.0;
    
    return {
      isValid: violations.length === 0,
      validationScore,
      violations,
      warnings,
      summary: `${violations.length} violations, ${warnings.length} warnings`
    };
  }

  // Dashboard and stats - return empty/default data
  async getDashboardStats(userId?: string): Promise<any> {
    return {
      totalInvoices: this.data.invoices.length.toString(),
      pendingInvoices: "0",
      approvedInvoices: "0",
      totalAmount: "0"
    };
  }

  async getPendingApprovals(): Promise<any[]> {
    return [];
  }

  async getTopIssuesThisMonth(): Promise<any[]> {
    return [
      { issue: "Database connection temporarily unavailable", count: 1 }
    ];
  }

  // Invoice Importer methods - minimal implementation
  async getInvoiceImporterConfigs(): Promise<InvoiceImporterConfig[]> {
    return this.data.invoiceImporterConfigs;
  }

  async getInvoiceImporterConfig(id: number): Promise<InvoiceImporterConfig | null> {
    return this.data.invoiceImporterConfigs.find(c => c.id === id) || null;
  }

  async createInvoiceImporterLog(log: InsertInvoiceImporterLog): Promise<InvoiceImporterLog> {
    const newLog = {
      ...log,
      id: this.nextId++,
      createdAt: new Date(),
      updatedAt: new Date()
    } as InvoiceImporterLog;
    this.data.invoiceImporterLogs.push(newLog);
    return newLog;
  }

  async updateInvoiceImporterLog(id: number, updates: Partial<InsertInvoiceImporterLog>): Promise<void> {
    const index = this.data.invoiceImporterLogs.findIndex(l => l.id === id);
    if (index >= 0) {
      this.data.invoiceImporterLogs[index] = {
        ...this.data.invoiceImporterLogs[index],
        ...updates,
        updatedAt: new Date()
      };
    }
  }

  // Stub implementations for other required methods
  async deleteAllUserInvoices(userId: string): Promise<number> {
    const count = this.data.invoices.filter(i => i.userId === userId).length;
    this.data.invoices = this.data.invoices.filter(i => i.userId !== userId);
    return count;
  }

  async deleteAllCompanyInvoices(companyId: number): Promise<number> {
    const count = this.data.invoices.filter(i => i.companyId === companyId).length;
    this.data.invoices = this.data.invoices.filter(i => i.companyId !== companyId);
    return count;
  }

  // Implement all other required interface methods with basic functionality
  async createLineItem(lineItem: InsertLineItem): Promise<LineItem> {
    const newItem = { ...lineItem, id: this.nextId++ } as LineItem;
    this.data.lineItems.push(newItem);
    return newItem;
  }

  async getLineItemsByInvoiceId(invoiceId: number): Promise<LineItem[]> {
    return this.data.lineItems.filter(item => item.invoiceId === invoiceId);
  }

  async deleteLineItemsByInvoiceId(invoiceId: number): Promise<void> {
    this.data.lineItems = this.data.lineItems.filter(item => item.invoiceId !== invoiceId);
  }

  async createApproval(approval: InsertApproval): Promise<Approval> {
    const newApproval = { ...approval, id: this.nextId++ } as Approval;
    this.data.approvals.push(newApproval);
    return newApproval;
  }

  async getApprovalsByInvoiceId(invoiceId: number): Promise<Approval[]> {
    return this.data.approvals.filter(a => a.invoiceId === invoiceId);
  }

  // Add remaining stub implementations for all IStorage methods...
  // (This is a simplified fallback - full implementation would include all methods)

  // For now, implement minimal stubs for critical methods
  [key: string]: any;

  constructor() {
    // Initialize with some default methods that return empty results
    const stubMethods = [
      'createProject', 'getProject', 'getProjects', 'getProjectsByCompanyId', 
      'updateProject', 'deleteProject', 'upsertProjectByProjectId',
      'createPurchaseOrder', 'getPurchaseOrder', 'getPurchaseOrders', 
      'getPurchaseOrdersByCompanyId', 'updatePurchaseOrder', 'deletePurchaseOrder',
      'upsertPurchaseOrderByPoId', 'createInvoicePoMatch', 'getInvoicePoMatchesByInvoiceId',
      'createInvoiceProjectMatch', 'getInvoiceProjectMatchesByInvoiceId',
      'createErpConnection', 'getErpConnection', 'getErpConnections',
      'updateErpConnection', 'deleteErpConnection', 'syncErpCredentialsToImportConfigs',
      'createInvoiceImporterConfig', 'getInvoiceImporterConfigsByUser',
      'updateInvoiceImporterConfig', 'deleteInvoiceImporterConfig',
      'deleteInvoiceImporterConfigCascade', 'cleanupInactiveConfigurations',
      'getInvoiceImporterLogs', 'getInvoiceImporterLogsByConfig',
      'getLatestInvoiceImporterLog', 'deleteInvoiceImporterLog',
      'createImportedInvoice', 'getImportedInvoices',
      'createErpTask', 'getErpTask', 'getErpTasks', 'updateErpTask', 'deleteErpTask',
      'createSavedWorkflow', 'getSavedWorkflow', 'getSavedWorkflows',
      'updateSavedWorkflow', 'deleteSavedWorkflow',
      'createScheduledTask', 'getScheduledTask', 'getScheduledTasks',
      'updateScheduledTask', 'deleteScheduledTask'
    ];

    stubMethods.forEach(method => {
      if (typeof this[method] === 'undefined') {
        this[method] = async (...args: any[]) => {
          console.warn(`FallbackStorage: ${method} called with args:`, args);
          if (method.startsWith('get') && method.endsWith('s')) {
            return []; // Return empty array for getters
          } else if (method.startsWith('get')) {
            return null; // Return null for single item getters
          } else if (method.startsWith('create')) {
            return { id: this.nextId++, ...args[0] }; // Return created item with ID
          } else {
            return undefined; // Return undefined for other operations
          }
        };
      }
    });
  }
}

export default FallbackStorage;