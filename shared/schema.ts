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
]);

// Validation rules table
export const validationRules = pgTable("validation_rules", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  description: text("description"),
  fieldName: varchar("field_name").notNull(), // e.g., 'vendorName', 'totalAmount', 'taxId'
  ruleType: validationRuleTypeEnum("rule_type").notNull(),
  ruleValue: text("rule_value").notNull(), // regex pattern, min/max values, etc.
  severity: validationSeverityEnum("severity").default("medium"),
  errorMessage: text("error_message"), // Custom error message
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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

// Add isPettyCash field to invoices
export const invoiceStatusEnumUpdated = pgEnum("invoice_status_updated", [
  "draft",
  "processing", 
  "processed",
  "approved",
  "rejected",
  "petty_cash_pending",
  "petty_cash_approved",
  "petty_cash_rejected"
]);

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
}));

export const lineItemsRelations = relations(lineItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [lineItems.invoiceId],
    references: [invoices.id],
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
