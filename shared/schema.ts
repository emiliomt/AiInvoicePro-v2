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

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
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
  severity: flagSeverityEnum("severity").notNull(),
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

// Relations
export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  user: one(users, {
    fields: [invoices.userId],
    references: [users.id],
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

export const projectsRelations = relations(projects, ({ many }) => ({
  purchaseOrders: many(purchaseOrders),
}));

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
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

// RPA (Robotic Process Automation) Integration Schema

// ERP System Types
export const erpSystemEnum = pgEnum("erp_system_type", [
  "sap",
  "oracle",
  "dynamics",
  "quickbooks",
  "netsuite",
  "custom_api",
  "sftp",
  "database",
  "sharepoint",
  "other"
]);

// RPA Connection Status
export const rpaStatusEnum = pgEnum("rpa_status", [
  "active",
  "inactive",
  "error",
  "testing",
  "maintenance"
]);

// RPA Extraction Status
export const extractionStatusEnum = pgEnum("extraction_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "retry",
  "cancelled"
]);

// Authentication Types
export const authTypeEnum = pgEnum("auth_type", [
  "basic",
  "oauth2",
  "saml",
  "api_key",
  "certificate",
  "sso"
]);

// ERP Connections table - stores connection details for different ERP systems
export const erpConnections = pgTable("erp_connections", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  connectionName: varchar("connection_name").notNull(),
  erpSystemType: erpSystemEnum("erp_system_type").notNull(),
  connectionConfig: jsonb("connection_config").notNull(), // Contains credentials, endpoints, etc.
  authType: authTypeEnum("auth_type").default("basic"),
  oauthConfig: jsonb("oauth_config"), // OAuth2/SSO configuration
  accessToken: text("access_token"), // Encrypted access token
  refreshToken: text("refresh_token"), // Encrypted refresh token
  tokenExpiresAt: timestamp("token_expires_at"),
  ssoUrl: varchar("sso_url"), // SSO login URL
  status: rpaStatusEnum("status").default("inactive"),
  lastConnected: timestamp("last_connected"),
  lastError: text("last_error"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// RPA Extraction Jobs - tracks automated extraction jobs
export const rpaExtractionJobs = pgTable("rpa_extraction_jobs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  erpConnectionId: integer("erp_connection_id").references(() => erpConnections.id).notNull(),
  jobName: varchar("job_name").notNull(),
  documentType: varchar("document_type").notNull(), // "invoice" or "purchase_order"
  extractionCriteria: jsonb("extraction_criteria").notNull(), // Date ranges, filters, etc.
  scheduleConfig: jsonb("schedule_config"), // Cron-like scheduling
  status: extractionStatusEnum("status").default("pending"),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  documentsExtracted: integer("documents_extracted").default(0),
  errorCount: integer("error_count").default(0),
  lastError: text("last_error"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// RPA Job Executions - detailed logs of each job run
export const rpaJobExecutions = pgTable("rpa_job_executions", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").references(() => rpaExtractionJobs.id).notNull(),
  executionId: varchar("execution_id").notNull(), // Unique ID for this execution
  status: extractionStatusEnum("status").notNull(),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  documentsFound: integer("documents_found").default(0),
  documentsProcessed: integer("documents_processed").default(0),
  documentsSkipped: integer("documents_skipped").default(0),
  errorCount: integer("error_count").default(0),
  executionLog: text("execution_log"),
  errorDetails: jsonb("error_details"),
  extractedDocuments: jsonb("extracted_documents"), // List of extracted document IDs
  createdAt: timestamp("created_at").defaultNow(),
});

// RPA Document Queue - temporary storage for documents being processed
export const rpaDocumentQueue = pgTable("rpa_document_queue", {
  id: serial("id").primaryKey(),
  jobExecutionId: integer("job_execution_id").references(() => rpaJobExecutions.id).notNull(),
  documentType: varchar("document_type").notNull(),
  sourceReference: varchar("source_reference").notNull(), // ERP document ID/reference
  documentData: jsonb("document_data").notNull(), // Raw document data from ERP
  processingStatus: varchar("processing_status").default("queued"), // queued, processing, completed, failed
  invoiceId: integer("invoice_id").references(() => invoices.id), // Linked after processing
  purchaseOrderId: integer("purchase_order_id").references(() => purchaseOrders.id), // Linked after processing
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at"),
});

// RPA Automation Rules - business rules for document processing
export const rpaAutomationRules = pgTable("rpa_automation_rules", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  ruleName: varchar("rule_name").notNull(),
  documentType: varchar("document_type").notNull(),
  ruleConditions: jsonb("rule_conditions").notNull(), // Conditions to trigger the rule
  ruleActions: jsonb("rule_actions").notNull(), // Actions to perform
  priority: integer("priority").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// RPA Relations
export const erpConnectionsRelations = relations(erpConnections, ({ one, many }) => ({
  user: one(users, {
    fields: [erpConnections.userId],
    references: [users.id],
  }),
  extractionJobs: many(rpaExtractionJobs),
}));

export const rpaExtractionJobsRelations = relations(rpaExtractionJobs, ({ one, many }) => ({
  user: one(users, {
    fields: [rpaExtractionJobs.userId],
    references: [users.id],
  }),
  erpConnection: one(erpConnections, {
    fields: [rpaExtractionJobs.erpConnectionId],
    references: [erpConnections.id],
  }),
  executions: many(rpaJobExecutions),
}));

export const rpaJobExecutionsRelations = relations(rpaJobExecutions, ({ one, many }) => ({
  job: one(rpaExtractionJobs, {
    fields: [rpaJobExecutions.jobId],
    references: [rpaExtractionJobs.id],
  }),
  queuedDocuments: many(rpaDocumentQueue),
}));

export const rpaDocumentQueueRelations = relations(rpaDocumentQueue, ({ one }) => ({
  jobExecution: one(rpaJobExecutions, {
    fields: [rpaDocumentQueue.jobExecutionId],
    references: [rpaJobExecutions.id],
  }),
  invoice: one(invoices, {
    fields: [rpaDocumentQueue.invoiceId],
    references: [invoices.id],
  }),
  purchaseOrder: one(purchaseOrders, {
    fields: [rpaDocumentQueue.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
}));

export const rpaAutomationRulesRelations = relations(rpaAutomationRules, ({ one }) => ({
  user: one(users, {
    fields: [rpaAutomationRules.userId],
    references: [users.id],
  }),
}));

// RPA Types
export type InsertErpConnection = typeof erpConnections.$inferInsert;
export type ErpConnection = typeof erpConnections.$inferSelect;

export type InsertRpaExtractionJob = typeof rpaExtractionJobs.$inferInsert;
export type RpaExtractionJob = typeof rpaExtractionJobs.$inferSelect;

export type InsertRpaJobExecution = typeof rpaJobExecutions.$inferInsert;
export type RpaJobExecution = typeof rpaJobExecutions.$inferSelect;

export type InsertRpaDocumentQueue = typeof rpaDocumentQueue.$inferInsert;
export type RpaDocumentQueue = typeof rpaDocumentQueue.$inferSelect;

export type InsertRpaAutomationRule = typeof rpaAutomationRules.$inferInsert;
export type RpaAutomationRule = typeof rpaAutomationRules.$inferSelect;

// RPA Zod schemas
export const insertErpConnectionSchema = createInsertSchema(erpConnections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRpaExtractionJobSchema = createInsertSchema(rpaExtractionJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRpaJobExecutionSchema = createInsertSchema(rpaJobExecutions).omit({
  id: true,
  createdAt: true,
});

export const insertRpaDocumentQueueSchema = createInsertSchema(rpaDocumentQueue).omit({
  id: true,
  createdAt: true,
});

export const insertRpaAutomationRuleSchema = createInsertSchema(rpaAutomationRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});