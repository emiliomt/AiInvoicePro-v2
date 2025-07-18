import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  serial,
  decimal,
  integer,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Companies table for multi-tenancy support
export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  domain: varchar("domain", { length: 255 }).unique(), // Company email domain for auto-assignment
  plan: varchar("plan", { length: 50 }).default("basic"), // subscription plan
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User roles enum
export const userRoleEnum = pgEnum("user_role", [
  "admin",    // Company admin - full access
  "manager",  // Department manager - limited admin access
  "user",     // Regular user - standard access
  "viewer"    // Read-only access
]);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  companyId: integer("company_id").references(() => companies.id),
  role: userRoleEnum("role").default("user"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Invoice status enum
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "pending",
  "processing",
  "extracted",
  "approved",
  "rejected",
  "paid",
  "matched",
]);

// Approval status enum
export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved", 
  "rejected",
]);

// Invoice table
export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  companyId: integer("company_id").references(() => companies.id),
  fileName: varchar("file_name").notNull(),
  fileUrl: varchar("file_url"),
  status: invoiceStatusEnum("status").default("pending"),
  vendorName: varchar("vendor_name"),
  invoiceNumber: varchar("invoice_number"),
  invoiceDate: timestamp("invoice_date"),
  dueDate: timestamp("due_date"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }),
  currency: varchar("currency").default("USD"),
  ocrText: text("ocr_text"),
  extractedData: jsonb("extracted_data"),
  projectName: varchar("project_name"),
  confidenceScore: decimal("confidence_score", { precision: 3, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Line items table
export const lineItems = pgTable("line_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull(),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Approvals table
export const approvals = pgTable("approvals", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull(),
  approverId: varchar("approver_id").notNull(),
  status: approvalStatusEnum("status").default("pending"),
  comments: text("comments"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Validation rule severity enum
export const validationSeverityEnum = pgEnum("validation_severity", [
  "low",
  "medium", 
  "high",
  "critical",
]);

// Validation rule type enum
export const validationRuleTypeEnum = pgEnum("validation_rule_type", [
  "required",
  "regex",
  "range",
  "enum",
  "format",
  "comparison",
]);

// Validation rules table
export const validationRules = pgTable("validation_rules", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  description: text("description"),
  ruleType: validationRuleTypeEnum("rule_type").notNull(),
  ruleData: text("rule_data"), // Legacy column that might exist in DB
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  fieldName: varchar("field_name").notNull(), // e.g., 'vendorName', 'totalAmount', 'taxId'
  ruleValue: text("rule_value").notNull(), // regex pattern, min/max values, etc.
  severity: validationSeverityEnum("severity").default("medium"),
  errorMessage: text("error_message"), // Custom error message
});

// Settings table for configuration
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).unique().notNull(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Petty cash status enum
export const pettyCashStatusEnum = pgEnum("petty_cash_status", [
  "pending_approval",
  "approved", 
  "rejected"
]);

// Petty cash log table
export const pettyCashLog = pgTable("petty_cash_log", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").references(() => invoices.id).notNull(),
  projectId: varchar("project_id", { length: 100 }),
  costCenter: varchar("cost_center", { length: 100 }),
  approvedBy: varchar("approved_by"),
  approvalFileUrl: text("approval_file_url"),
  status: pettyCashStatusEnum("status").default("pending_approval"),
  approvalNotes: text("approval_notes"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// PO status enum
export const poStatusEnum = pgEnum("po_status", [
  "open",
  "partial",
  "closed",
  "cancelled"
]);

// Match status enum
export const matchStatusEnum = pgEnum("match_status", [
  "auto",
  "manual", 
  "unresolved"
]);



// Projects table with validation criteria
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  projectId: varchar("project_id", { length: 100 }).unique().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  address: varchar("address", { length: 500 }),
  city: varchar("city", { length: 100 }),
  vatNumber: varchar("vat_number", { length: 50 }),
  supervisor: varchar("supervisor", { length: 255 }),
  budget: decimal("budget", { precision: 12, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("COP"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  status: varchar("status", { length: 50 }).default("active"),
  validationStatus: varchar("validation_status", { length: 50 }).default("pending"),
  isValidated: boolean("is_validated").default(false),
  validatedAt: timestamp("validated_at"),
  validatedBy: varchar("validated_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Purchase orders table
export const purchaseOrders = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  poId: varchar("po_id", { length: 100 }).unique().notNull(),
  vendorName: varchar("vendor_name", { length: 255 }).notNull(),
  projectId: varchar("project_id", { length: 100 }).references(() => projects.projectId),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("COP"),
  items: jsonb("items").notNull(), // Array of line items
  issueDate: timestamp("issue_date").notNull(),
  expectedDeliveryDate: timestamp("expected_delivery_date"),
  status: poStatusEnum("status").default("open"),
  originalOrderNumber: varchar("original_order_number", { length: 100 }), // Store the original orden_compra_no
  buyerName: varchar("buyer_name", { length: 255 }),
  buyerAddress: text("buyer_address"),
  vendorAddress: text("vendor_address"),
  terms: text("terms"),
  ocrText: text("ocr_text"),
  fileName: varchar("file_name", { length: 255 }),
  uploadedBy: varchar("uploaded_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Invoice-PO matches table
export const invoicePoMatches = pgTable("invoice_po_matches", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").references(() => invoices.id).notNull(),
  poId: integer("po_id").references(() => purchaseOrders.id).notNull(),
  matchScore: decimal("match_score", { precision: 5, scale: 2 }).notNull(), // 0-100
  status: matchStatusEnum("status").default("auto"),
  matchDetails: jsonb("match_details"), // Details about what matched
  matchedAt: timestamp("matched_at").defaultNow(), // When the match was initially created
  approvedAt: timestamp("approved_at"), // When the match was approved (if manual status)
  rejectedAt: timestamp("rejected_at"), // When the match was rejected (if unresolved status)
  approvedBy: varchar("approved_by"), // User who approved the match
  rejectedBy: varchar("rejected_by"), // User who rejected the match
  statusChangedAt: timestamp("status_changed_at"), // Last status change timestamp
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Invoice-Project matches table for project matcher
export const invoiceProjectMatches = pgTable("invoice_project_matches", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").references(() => invoices.id).notNull(),
  projectId: varchar("project_id", { length: 100 }).references(() => projects.projectId).notNull(),
  matchScore: decimal("match_score", { precision: 5, scale: 2 }).notNull(), // 0-100
  status: matchStatusEnum("status").default("auto"),
  matchDetails: jsonb("match_details"), // Details about what matched (address, city, project name similarity)
  isActive: boolean("is_active").default(true), // Allow multiple matches but only one active
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Approved invoice-project assignments table
export const approvedInvoiceProject = pgTable("approved_invoice_project", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").references(() => invoices.id).notNull(),
  projectId: varchar("project_id", { length: 100 }).references(() => projects.projectId).notNull(),
  matchScore: decimal("match_score", { precision: 5, scale: 2 }).notNull(),
  matchDetails: jsonb("match_details"),
  approvedBy: varchar("approved_by").notNull(),
  approvedAt: timestamp("approved_at").defaultNow(),
  originalMatchId: integer("original_match_id").references(() => invoiceProjectMatches.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Verified invoice-project assignments table (invoices that passed validation)
export const verifiedInvoiceProject = pgTable("verified_invoice_project", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").references(() => invoices.id).notNull(),
  projectId: varchar("project_id", { length: 100 }).references(() => projects.projectId).notNull(),
  matchScore: decimal("match_score", { precision: 5, scale: 2 }).notNull(),
  matchDetails: jsonb("match_details"),
  approvedBy: varchar("approved_by").notNull(),
  approvedAt: timestamp("approved_at").notNull(),
  verifiedAt: timestamp("verified_at").defaultNow(),
  originalMatchId: integer("original_match_id").references(() => invoiceProjectMatches.id),
  originalApprovedId: integer("original_approved_id").references(() => approvedInvoiceProject.id),
  validationResults: jsonb("validation_results"), // Store validation details
  createdAt: timestamp("created_at").defaultNow(),
});

// Flag types and severity enums
export const flagTypeEnum = pgEnum("flag_type", [
  "duplicate_invoice",
  "amount_mismatch",
  "missing_po_match",
  "tax_id_mismatch",
  "vendor_mismatch",
  "date_discrepancy"
]);

export const flagSeverityEnum = pgEnum("flag_severity", [
  "low",
  "medium",
  "high",
  "critical"
]);

// Invoice flags table for discrepancy detection
export const invoiceFlags = pgTable("invoice_flags", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").references(() => invoices.id).notNull(),
  flagType: flagTypeEnum("flag_type").notNull(),
  severity: flagSeverityEnum("flag_severity").notNull(),
  message: text("message").notNull(),
  details: jsonb("details"), // Additional details about the discrepancy
  isResolved: boolean("is_resolved").default(false),
  resolvedBy: varchar("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Predictive alerts table
export const predictiveAlerts = pgTable("predictive_alerts", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").references(() => invoices.id).notNull(),
  prediction: text("prediction").notNull(),
  confidence: decimal("confidence", { precision: 3, scale: 2 }).notNull(), // 0-1
  alertType: varchar("alert_type", { length: 100 }).notNull(),
  details: jsonb("details"),
  isActioned: boolean("is_actioned").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// ERP task status enum
export const erpTaskStatusEnum = pgEnum("erp_task_status", [
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled"
]);

// ERP connections table
export const erpConnections = pgTable("erp_connections", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  companyId: integer("company_id").references(() => companies.id),
  name: varchar("name", { length: 255 }).notNull(),
  baseUrl: varchar("base_url", { length: 500 }).notNull(),
  username: varchar("username", { length: 255 }).notNull(),
  password: text("password").notNull(), // Encrypted
  description: text("description"),
  downloadPath: varchar("download_path", { length: 500 }), // For Python RPA downloads
  xmlPath: varchar("xml_path", { length: 500 }), // For Python RPA XML storage
  isActive: boolean("is_active").default(true),
  lastUsed: timestamp("last_used"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ERP tasks table
export const erpTasks = pgTable("erp_tasks", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  connectionId: integer("connection_id").references(() => erpConnections.id).notNull(),
  taskDescription: text("task_description").notNull(),
  generatedScript: text("generated_script"),
  status: erpTaskStatusEnum("status").default("pending"),
  result: jsonb("result"),
  logs: text("logs"),
  screenshots: text("screenshots").array(),
  executionTime: integer("execution_time"), // in milliseconds
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Saved automation workflows
export const savedWorkflows = pgTable("saved_workflows", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  companyId: integer("company_id").references(() => companies.id),
  connectionId: integer("connection_id").references(() => erpConnections.id).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Scheduled automation tasks
export const scheduledTasks = pgTable("scheduled_tasks", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflow_id").references(() => savedWorkflows.id).notNull(),
  userId: varchar("user_id").notNull(),
  companyId: integer("company_id").references(() => companies.id),
  name: varchar("name", { length: 255 }).notNull(),
  cronExpression: varchar("cron_expression", { length: 100 }), // e.g., "0 9 * * *" for daily at 9 AM
  timezone: varchar("timezone", { length: 50 }).default("UTC"),
  isActive: boolean("is_active").default(true),
  lastRun: timestamp("last_run"),
  nextRun: timestamp("next_run"),
  runCount: integer("run_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Feedback logs table for extraction error reporting
export const feedbackLogs = pgTable("feedback_logs", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").references(() => invoices.id).notNull(),
  userId: varchar("user_id").notNull(),
  originalText: text("original_text"),
  extractedData: jsonb("extracted_data"),
  correctedData: jsonb("corrected_data"),
  reason: text("reason"),
  fileName: varchar("file_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Invoice Importer module enums
export const fileTypeEnum = pgEnum("file_type", ["xml", "pdf", "both"]);
export const scheduleTypeEnum = pgEnum("schedule_type", ["once", "daily", "weekly", "hourly", "multiple_daily"]);
export const importerStatusEnum = pgEnum("importer_status", ["pending", "running", "completed", "failed", "scheduled"]);

// Invoice Importer configurations
export const invoiceImporterConfigs = pgTable("invoice_importer_configs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  companyId: integer("company_id").references(() => companies.id),
  connectionId: integer("connection_id").references(() => erpConnections.id).notNull(),
  taskName: varchar("task_name", { length: 255 }).notNull(),
  description: text("description"),
  fileTypes: fileTypeEnum("file_types").default("both"),
  scheduleType: scheduleTypeEnum("schedule_type").default("once"),
  scheduleTime: varchar("schedule_time", { length: 50 }), // "14:30" for daily, "monday-14:30" for weekly, "4" for hourly, "3" for multiple daily
  scheduleDay: varchar("schedule_day", { length: 20 }), // for weekly scheduling
  // Python RPA specific fields
  erpUrl: varchar("erp_url", { length: 500 }),
  erpUsername: varchar("erp_username", { length: 255 }),
  erpPassword: text("erp_password"), // Encrypted
  downloadPath: varchar("download_path", { length: 500 }),
  xmlPath: varchar("xml_path", { length: 500 }),
  isActive: boolean("is_active").default(true),
  lastRun: timestamp("last_run"),
  nextRun: timestamp("next_run"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Invoice Importer execution logs
export const invoiceImporterLogs = pgTable("invoice_importer_logs", {
  id: serial("id").primaryKey(),
  configId: integer("config_id").references(() => invoiceImporterConfigs.id).notNull(),
  status: importerStatusEnum("status").default("pending"),
  totalInvoices: integer("total_invoices").default(0),
  processedInvoices: integer("processed_invoices").default(0),
  successfulImports: integer("successful_imports").default(0),
  failedImports: integer("failed_imports").default(0),
  logs: text("logs"),
  screenshots: text("screenshots").array(),
  errorMessage: text("error_message"),
  executionTime: integer("execution_time"), // in milliseconds
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Imported invoice metadata
export const importedInvoices = pgTable("imported_invoices", {
  id: serial("id").primaryKey(),
  logId: integer("log_id").references(() => invoiceImporterLogs.id).notNull(),
  invoiceId: integer("invoice_id").references(() => invoices.id), // linked after processing
  originalFileName: varchar("original_file_name", { length: 255 }),
  fileType: varchar("file_type", { length: 10 }), // xml, pdf
  fileSize: integer("file_size"),
  filePath: varchar("file_path", { length: 500 }),
  erpDocumentId: varchar("erp_document_id", { length: 100 }), // ERP system reference
  downloadedAt: timestamp("downloaded_at"),
  processedAt: timestamp("processed_at"),
  metadata: jsonb("metadata"), // extracted invoice data
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const companiesRelations = relations(companies, ({ many }) => ({
  users: many(users),
  invoices: many(invoices),
  projects: many(projects),
  purchaseOrders: many(purchaseOrders),
  erpConnections: many(erpConnections),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  company: one(companies, {
    fields: [users.companyId],
    references: [companies.id],
  }),
  invoices: many(invoices),
  erpConnections: many(erpConnections),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  user: one(users, {
    fields: [invoices.userId],
    references: [users.id],
  }),
  company: one(companies, {
    fields: [invoices.companyId],
    references: [companies.id],
  }),
  lineItems: many(lineItems),
  approvals: many(approvals),
  pettyCash: one(pettyCashLog, {
    fields: [invoices.id],
    references: [pettyCashLog.invoiceId],
  }),
  poMatches: many(invoicePoMatches),
  flags: many(invoiceFlags),
  predictiveAlerts: many(predictiveAlerts),
}));

export const lineItemsRelations = relations(lineItems, ({ one, many }) => ({
  invoice: one(invoices, {
    fields: [lineItems.invoiceId],
    references: [invoices.id],
  }),
  classification: one(lineItemClassifications, {
    fields: [lineItems.id],
    references: [lineItemClassifications.lineItemId],
  }),
}));

export const approvalsRelations = relations(approvals, ({ one }) => ({
  invoice: one(invoices, {
    fields: [approvals.invoiceId],
    references: [invoices.id],
  }),
  approver: one(users, {
    fields: [approvals.approverId],
    references: [users.id],
  }),
}));

export const pettyCashLogRelations = relations(pettyCashLog, ({ one }) => ({
  invoice: one(invoices, {
    fields: [pettyCashLog.invoiceId],
    references: [invoices.id],
  }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  company: one(companies, {
    fields: [projects.companyId],
    references: [companies.id],
  }),
  purchaseOrders: many(purchaseOrders),
}));

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
  company: one(companies, {
    fields: [purchaseOrders.companyId],
    references: [companies.id],
  }),
  project: one(projects, {
    fields: [purchaseOrders.projectId],
    references: [projects.projectId],
  }),
  invoiceMatches: many(invoicePoMatches),
}));

export const invoicePoMatchesRelations = relations(invoicePoMatches, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoicePoMatches.invoiceId],
    references: [invoices.id],
  }),
  purchaseOrder: one(purchaseOrders, {
    fields: [invoicePoMatches.poId],
    references: [purchaseOrders.id],
  }),
}));

export const invoiceProjectMatchesRelations = relations(invoiceProjectMatches, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceProjectMatches.invoiceId],
    references: [invoices.id],
  }),
  project: one(projects, {
    fields: [invoiceProjectMatches.projectId],
    references: [projects.projectId],
  }),
}));

export const approvedInvoiceProjectRelations = relations(approvedInvoiceProject, ({ one }) => ({
  invoice: one(invoices, {
    fields: [approvedInvoiceProject.invoiceId],
    references: [invoices.id],
  }),
  project: one(projects, {
    fields: [approvedInvoiceProject.projectId],
    references: [projects.projectId],
  }),
  originalMatch: one(invoiceProjectMatches, {
    fields: [approvedInvoiceProject.originalMatchId],
    references: [invoiceProjectMatches.id],
  }),
}));

export const verifiedInvoiceProjectRelations = relations(verifiedInvoiceProject, ({ one }) => ({
  invoice: one(invoices, {
    fields: [verifiedInvoiceProject.invoiceId],
    references: [invoices.id],
  }),
  project: one(projects, {
    fields: [verifiedInvoiceProject.projectId],
    references: [projects.projectId],
  }),
  originalMatch: one(invoiceProjectMatches, {
    fields: [verifiedInvoiceProject.originalMatchId],
    references: [invoiceProjectMatches.id],
  }),
  originalApproved: one(approvedInvoiceProject, {
    fields: [verifiedInvoiceProject.originalApprovedId],
    references: [approvedInvoiceProject.id],
  }),
}));

export const invoiceFlagsRelations = relations(invoiceFlags, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceFlags.invoiceId],
    references: [invoices.id],
  }),
}));

export const predictiveAlertsRelations = relations(predictiveAlerts, ({ one }) => ({
  invoice: one(invoices, {
    fields: [predictiveAlerts.invoiceId],
    references: [invoices.id],
  }),
}));

export const erpConnectionsRelations = relations(erpConnections, ({ one, many }) => ({
  user: one(users, {
    fields: [erpConnections.userId],
    references: [users.id],
  }),
  tasks: many(erpTasks),
}));

export const erpTasksRelations = relations(erpTasks, ({ one }) => ({
  user: one(users, {
    fields: [erpTasks.userId],
    references: [users.id],
  }),
  connection: one(erpConnections, {
    fields: [erpTasks.connectionId],
    references: [erpConnections.id],
  }),
}));

export const savedWorkflowsRelations = relations(savedWorkflows, ({ one, many }) => ({
  connection: one(erpConnections, {
    fields: [savedWorkflows.connectionId],
    references: [erpConnections.id],
  }),
  company: one(companies, {
    fields: [savedWorkflows.companyId],
    references: [companies.id],
  }),
  scheduledTasks: many(scheduledTasks),
}));

export const scheduledTasksRelations = relations(scheduledTasks, ({ one }) => ({
  workflow: one(savedWorkflows, {
    fields: [scheduledTasks.workflowId],
    references: [savedWorkflows.id],
  }),
  company: one(companies, {
    fields: [scheduledTasks.companyId],
    references: [companies.id],
  }),
}));

// Invoice Importer relations
export const invoiceImporterConfigsRelations = relations(invoiceImporterConfigs, ({ one, many }) => ({
  company: one(companies, {
    fields: [invoiceImporterConfigs.companyId],
    references: [companies.id],
  }),
  connection: one(erpConnections, {
    fields: [invoiceImporterConfigs.connectionId],
    references: [erpConnections.id],
  }),
  logs: many(invoiceImporterLogs),
}));

export const invoiceImporterLogsRelations = relations(invoiceImporterLogs, ({ one, many }) => ({
  config: one(invoiceImporterConfigs, {
    fields: [invoiceImporterLogs.configId],
    references: [invoiceImporterConfigs.id],
  }),
  importedInvoices: many(importedInvoices),
}));

export const importedInvoicesRelations = relations(importedInvoices, ({ one }) => ({
  log: one(invoiceImporterLogs, {
    fields: [importedInvoices.logId],
    references: [invoiceImporterLogs.id],
  }),
  invoice: one(invoices, {
    fields: [importedInvoices.invoiceId],
    references: [invoices.id],
  }),
}));

// Classification keyword categories enum
export const classificationCategoryEnum = pgEnum("classification_category", [
  "consumable_materials",
  "non_consumable_materials", 
  "labor",
  "tools_equipment"
]);

// Classification keywords table
export const classificationKeywords = pgTable("classification_keywords", {
  id: serial("id").primaryKey(),
  category: classificationCategoryEnum("category").notNull(),
  keyword: varchar("keyword", { length: 255 }).notNull(),
  isDefault: boolean("is_default").default(false),
  userId: varchar("user_id"), // null for system defaults, user ID for custom keywords
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Line item classifications table
export const lineItemClassifications = pgTable("line_item_classifications", {
  id: serial("id").primaryKey(),
  lineItemId: integer("line_item_id").references(() => lineItems.id).notNull(),
  category: classificationCategoryEnum("category").notNull(),
  matchedKeyword: varchar("matched_keyword", { length: 255 }),
  isManualOverride: boolean("is_manual_override").default(false),
  confidence: decimal("confidence", { precision: 3, scale: 2 }), // 0-1 confidence score
  classifiedAt: timestamp("classified_at").defaultNow(),
  classifiedBy: varchar("classified_by"),
});

export const feedbackLogsRelations = relations(feedbackLogs, ({ one }) => ({
  invoice: one(invoices, {
    fields: [feedbackLogs.invoiceId],
    references: [invoices.id],
  }),
  user: one(users, {
    fields: [feedbackLogs.userId],
    references: [users.id],
  }),
}));

export const classificationKeywordsRelations = relations(classificationKeywords, ({ one }) => ({
  user: one(users, {
    fields: [classificationKeywords.userId],
    references: [users.id],
  }),
}));

export const lineItemClassificationsRelations = relations(lineItemClassifications, ({ one }) => ({
  lineItem: one(lineItems, {
    fields: [lineItemClassifications.lineItemId],
    references: [lineItems.id],
  }),
}));

// Types
export type InsertCompany = typeof companies.$inferInsert;
export type Company = typeof companies.$inferSelect;

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export type InsertInvoice = typeof invoices.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;

export type InsertLineItem = typeof lineItems.$inferInsert;
export type LineItem = typeof lineItems.$inferSelect;

export type InsertApproval = typeof approvals.$inferInsert;
export type Approval = typeof approvals.$inferSelect;

export type InsertValidationRule = typeof validationRules.$inferInsert;
export type ValidationRule = typeof validationRules.$inferSelect;

export type InsertSetting = typeof settings.$inferInsert;
export type Setting = typeof settings.$inferSelect;

export type InsertPettyCashLog = typeof pettyCashLog.$inferInsert;
export type PettyCashLog = typeof pettyCashLog.$inferSelect;

export type InsertProject = typeof projects.$inferInsert;
export type Project = typeof projects.$inferSelect;

export type InsertPurchaseOrder = typeof purchaseOrders.$inferInsert;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;

export type InsertInvoicePoMatch = typeof invoicePoMatches.$inferInsert;
export type InvoicePoMatch = typeof invoicePoMatches.$inferSelect;

export type InsertInvoiceProjectMatch = typeof invoiceProjectMatches.$inferInsert;
export type InvoiceProjectMatch = typeof invoiceProjectMatches.$inferSelect;

export type InsertApprovedInvoiceProject = typeof approvedInvoiceProject.$inferInsert;
export type ApprovedInvoiceProject = typeof approvedInvoiceProject.$inferSelect;

export type InsertVerifiedInvoiceProject = typeof verifiedInvoiceProject.$inferInsert;
export type VerifiedInvoiceProject = typeof verifiedInvoiceProject.$inferSelect;

export type InsertInvoiceFlag = typeof invoiceFlags.$inferInsert;
export type InvoiceFlag = typeof invoiceFlags.$inferSelect;

export type InsertPredictiveAlert = typeof predictiveAlerts.$inferInsert;
export type PredictiveAlert = typeof predictiveAlerts.$inferSelect;

export type InsertFeedbackLog = typeof feedbackLogs.$inferInsert;
export type FeedbackLog = typeof feedbackLogs.$inferSelect;

export type InsertClassificationKeyword = typeof classificationKeywords.$inferInsert;
export type ClassificationKeyword = typeof classificationKeywords.$inferSelect;

export type InsertLineItemClassification = typeof lineItemClassifications.$inferInsert;
export type LineItemClassification = typeof lineItemClassifications.$inferSelect;

// Invoice Importer types
export type InvoiceImporterConfig = typeof invoiceImporterConfigs.$inferSelect;
export type InsertInvoiceImporterConfig = typeof invoiceImporterConfigs.$inferInsert;

export type InvoiceImporterLog = typeof invoiceImporterLogs.$inferSelect;
export type InsertInvoiceImporterLog = typeof invoiceImporterLogs.$inferInsert;

export type ImportedInvoice = typeof importedInvoices.$inferSelect;
export type InsertImportedInvoice = typeof importedInvoices.$inferInsert;

// Zod schemas
export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLineItemSchema = createInsertSchema(lineItems).omit({
  id: true,
  createdAt: true,
});

export const insertApprovalSchema = createInsertSchema(approvals).omit({
  id: true,
  createdAt: true,
  approvedAt: true,
});

export const insertValidationRuleSchema = createInsertSchema(validationRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSettingSchema = createInsertSchema(settings).omit({
  id: true,
  updatedAt: true,
});

export const insertPettyCashLogSchema = createInsertSchema(pettyCashLog).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInvoicePoMatchSchema = createInsertSchema(invoicePoMatches).omit({
  id: true,
  matchedAt: true,
  statusChangedAt: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInvoiceProjectMatchSchema = createInsertSchema(invoiceProjectMatches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertApprovedInvoiceProjectSchema = createInsertSchema(approvedInvoiceProject).omit({
  id: true,
  createdAt: true,
});

// Invoice Importer Zod schemas
export const insertInvoiceImporterConfigSchema = createInsertSchema(invoiceImporterConfigs).omit({
  id: true,
  userId: true,
  companyId: true,
  createdAt: true,
  updatedAt: true,
  lastRun: true,
  nextRun: true,
});

export const insertInvoiceImporterLogSchema = createInsertSchema(invoiceImporterLogs).omit({
  id: true,
  createdAt: true,
});

export const insertImportedInvoiceSchema = createInsertSchema(importedInvoices).omit({
  id: true,
  createdAt: true,
});

// ERP Automation Types
export type InsertErpConnection = typeof erpConnections.$inferInsert;
export type ErpConnection = typeof erpConnections.$inferSelect;

export type InsertErpTask = typeof erpTasks.$inferInsert;
export type ErpTask = typeof erpTasks.$inferSelect;

export type InsertSavedWorkflow = typeof savedWorkflows.$inferInsert;
export type SavedWorkflow = typeof savedWorkflows.$inferSelect;

export type InsertScheduledTask = typeof scheduledTasks.$inferInsert;
export type ScheduledTask = typeof scheduledTasks.$inferSelect;

// ERP Automation Zod schemas
export const insertErpConnectionSchema = createInsertSchema(erpConnections).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
  lastUsed: true,
  isActive: true,
});

export const insertErpTaskSchema = createInsertSchema(erpTasks).omit({
  id: true,
  userId: true,
  status: true,
  generatedScript: true,
  createdAt: true,
  updatedAt: true,
  result: true,
  logs: true,
  screenshots: true,
  executionTime: true,
  errorMessage: true,
});

export const insertSavedWorkflowSchema = createInsertSchema(savedWorkflows).omit({
  id: true,
  userId: true,
  companyId: true,
  createdAt: true,
  updatedAt: true,
  isActive: true,
});

export const createSavedWorkflowSchema = insertSavedWorkflowSchema;

export const insertScheduledTaskSchema = createInsertSchema(scheduledTasks).omit({
  id: true,
  userId: true,
  companyId: true,
  createdAt: true,
  updatedAt: true,
  lastRun: true,
  nextRun: true,
  runCount: true,
});