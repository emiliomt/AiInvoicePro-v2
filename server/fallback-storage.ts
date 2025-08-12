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
    console.log(`Fallback: Would delete all invoices for user ${userId}`);
    return 0;
  }

  // Classification Keywords methods
  async getClassificationKeywords(userId: string): Promise<any[]> {
    console.log(`Fallback: Getting classification keywords for user ${userId}`);
    return [];
  }

  async addClassificationKeyword(keywordData: any): Promise<any> {
    console.log(`Fallback: Would add classification keyword:`, keywordData);
    return { id: 1, ...keywordData };
  }

  async removeClassificationKeyword(keywordId: number, userId: string): Promise<void> {
    console.log(`Fallback: Would remove classification keyword ${keywordId} for user ${userId}`);
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

  // Critical missing methods that are causing errors
  async getImportLogsWithDetails(): Promise<any[]> {
    return this.data.invoiceImporterLogs.map(log => ({
      ...log,
      duration: null,
      startTime: log.createdAt.toISOString(),
      endTime: null,
      fileType: 'both',
      triggeredBy: 'Manual'
    }));
  }

  async getErpConnections(userId?: string): Promise<any[]> {
    return this.data.erpConnections;
  }

  async getInvoiceImporterLogs(configId?: number): Promise<any[]> {
    if (configId) {
      return this.data.invoiceImporterLogs.filter(log => log.configId === configId);
    }
    return this.data.invoiceImporterLogs;
  }

  async getInvoiceImporterConfigsByUser(userId: string): Promise<any[]> {
    return this.data.invoiceImporterConfigs.filter(config => config.userId === userId);
  }

  async getLatestInvoiceImporterLog(configId: number): Promise<any> {
    const logs = this.data.invoiceImporterLogs
      .filter(log => log.configId === configId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return logs[0] || null;
  }

  async getInvoiceImporterLog(id: number): Promise<any> {
    return this.data.invoiceImporterLogs.find(log => log.id === id) || null;
  }

  async getImportedInvoicesByLog(logId: number): Promise<any[]> {
    return this.data.importedInvoices.filter(invoice => invoice.logId === logId);
  }

  async updateImportedInvoice(id: number, updates: any): Promise<void> {
    const index = this.data.importedInvoices.findIndex(invoice => invoice.id === id);
    if (index >= 0) {
      this.data.importedInvoices[index] = { ...this.data.importedInvoices[index], ...updates };
    }
  }

  async getUsersByCompany(companyId: number): Promise<any[]> {
    return this.data.users.filter(user => user.companyId === companyId);
  }

  async getValidationRule(id: number): Promise<any> {
    const rules = await this.getValidationRules();
    return rules.find(rule => rule.id === id) || null;
  }

  async createValidationRule(rule: any): Promise<any> {
    const newRule = { ...rule, id: this.nextId++, createdAt: new Date(), updatedAt: new Date() };
    this.data.validationRules.push(newRule);
    return newRule;
  }

  async updateValidationRule(id: number, updates: any): Promise<any> {
    const index = this.data.validationRules.findIndex(rule => rule.id === id);
    if (index >= 0) {
      this.data.validationRules[index] = { ...this.data.validationRules[index], ...updates, updatedAt: new Date() };
      return this.data.validationRules[index];
    }
    throw new Error(`Validation rule ${id} not found`);
  }

  async deleteValidationRule(id: number): Promise<void> {
    this.data.validationRules = this.data.validationRules.filter(rule => rule.id !== id);
  }

  async validateAllApprovedInvoices(): Promise<any> {
    return { validated: 0, errors: [] };
  }

  // Settings methods
  async getSetting(key: string): Promise<any> {
    const setting = this.data.settings.find(s => s.key === key);
    return setting ? setting.value : null;
  }

  async updateSetting(key: string, value: string): Promise<any> {
    const index = this.data.settings.findIndex(s => s.key === key);
    if (index >= 0) {
      this.data.settings[index].value = value;
      return this.data.settings[index];
    }
    return null;
  }

  async setSetting(setting: { key: string; value: string; description: string }): Promise<any> {
    const existing = this.data.settings.findIndex(s => s.key === setting.key);
    if (existing >= 0) {
      this.data.settings[existing] = { ...this.data.settings[existing], ...setting };
      return this.data.settings[existing];
    } else {
      const newSetting = { id: this.nextId++, ...setting };
      this.data.settings.push(newSetting);
      return newSetting;
    }
  }

  // Petty Cash methods
  async createPettyCashLog(log: any): Promise<any> {
    const newLog = { ...log, id: this.nextId++ };
    this.data.pettyCashLogs.push(newLog);
    return newLog;
  }

  async updatePettyCashLog(id: number, updates: any): Promise<any> {
    const index = this.data.pettyCashLogs.findIndex(log => log.id === id);
    if (index >= 0) {
      this.data.pettyCashLogs[index] = { ...this.data.pettyCashLogs[index], ...updates };
      return this.data.pettyCashLogs[index];
    }
    return null;
  }

  async getPettyCashLogs(status?: string): Promise<any[]> {
    if (status) {
      return this.data.pettyCashLogs.filter(log => log.status === status);
    }
    return this.data.pettyCashLogs;
  }

  async getPettyCashLogByInvoiceId(invoiceId: number): Promise<any> {
    return this.data.pettyCashLogs.find(log => log.invoiceId === invoiceId) || null;
  }

  // Learning and feedback methods
  async getTotalFeedbackCount(): Promise<number> {
    return this.data.feedbackLogs.length;
  }

  async getLearningInsights(type?: string): Promise<any[]> {
    return [];
  }

  async storeLearningInsight(insight: any): Promise<void> {
    // Store learning insight
  }

  async createFeedbackLog(log: any): Promise<any> {
    const newLog = { ...log, id: this.nextId++ };
    this.data.feedbackLogs.push(newLog);
    return newLog;
  }

  async getFeedbackLogs(limit?: number): Promise<any[]> {
    const logs = this.data.feedbackLogs;
    return limit ? logs.slice(0, limit) : logs;
  }

  async getFeedbackLog(id: number): Promise<any> {
    return this.data.feedbackLogs.find(log => log.id === id) || null;
  }

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
      'createErpConnection', 'getErpConnection',
      'updateErpConnection', 'deleteErpConnection', 'syncErpCredentialsToImportConfigs',
      'createInvoiceImporterConfig',
      'updateInvoiceImporterConfig', 'deleteInvoiceImporterConfig',
      'deleteInvoiceImporterConfigCascade', 'cleanupInactiveConfigurations',
      'getInvoiceImporterLogsByConfig',
      'deleteInvoiceImporterLog',
      'createImportedInvoice', 'getImportedInvoices',
      'createErpTask', 'getErpTask', 'getErpTasks', 'updateErpTask', 'deleteErpTask',
      'createSavedWorkflow', 'getSavedWorkflow', 'getSavedWorkflows',
      'updateSavedWorkflow', 'deleteSavedWorkflow',
      'createScheduledTask', 'getScheduledTask', 'getScheduledTasks',
      'updateScheduledTask', 'deleteScheduledTask',
      'getInvoicesWithProjectMatches', 'getCompanyInvoicesWithProjectMatches',
      'deleteAllProjects', 'getPurchaseOrderByPoId', 'getAllPurchaseOrders',
      'getInvoicePoMatches', 'assignProjectToInvoice', 'updateInvoicePoMatch',
      'getUnresolvedMatches', 'getInvoiceProjectMatches', 'findPotentialProjectMatches',
      'updateInvoiceProjectMatch', 'setActiveProjectMatch', 'getUnresolvedProjectMatches',
      'getInvoiceFlags', 'resolveInvoiceFlag', 'getPredictiveAlerts',
      // 'getClassificationKeywords', 'addClassificationKeyword', 'removeClassificationKeyword', // These are now implemented above
      'getLineItemClassifications', 'updateLineItemClassification',
      'createApprovedInvoiceProject', 'getApprovedInvoiceProjects', 'getVerifiedInvoiceProjects',
      'getInvoicePoMatchesWithDetails', 'moveApprovedToVerified'
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