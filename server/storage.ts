import {
  users,
  invoices,
  lineItems,
  approvals,
  validationRules,
  type User,
  type UpsertUser,
  type Invoice,
  type InsertInvoice,
  type LineItem,
  type InsertLineItem,
  type Approval,
  type InsertApproval,
  type ValidationRule,
  type InsertValidationRule,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, count, sum, sql } from "drizzle-orm";

// Interface for storage operations
export interface IStorage {
  // User operations
  // (IMPORTANT) these user operations are mandatory for Replit Auth.
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Invoice operations
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  getInvoice(id: number): Promise<Invoice | undefined>;
  getInvoicesByUserId(userId: string): Promise<Invoice[]>;
  updateInvoice(id: number, updates: Partial<InsertInvoice>): Promise<Invoice>;
  
  // Line item operations
  createLineItems(items: InsertLineItem[]): Promise<LineItem[]>;
  getLineItemsByInvoiceId(invoiceId: number): Promise<LineItem[]>;
  
  // Approval operations
  createApproval(approval: InsertApproval): Promise<Approval>;
  getApprovalsByInvoiceId(invoiceId: number): Promise<Approval[]>;
  updateApproval(id: number, updates: Partial<InsertApproval>): Promise<Approval>;
  getPendingApprovals(): Promise<(Approval & { invoice: Invoice })[]>;
  
  // Validation rules
  getValidationRules(): Promise<ValidationRule[]>;
  createValidationRule(rule: InsertValidationRule): Promise<ValidationRule>;
  
  // Dashboard stats
  getDashboardStats(userId?: string): Promise<{
    totalInvoices: number;
    pendingApproval: number;
    processedToday: number;
    totalValue: string;
  }>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  // (IMPORTANT) these user operations are mandatory for Replit Auth.
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Invoice operations
  async createInvoice(invoice: InsertInvoice): Promise<Invoice> {
    const [created] = await db.insert(invoices).values(invoice).returning();
    return created;
  }

  async getInvoice(id: number): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice;
  }

  async getInvoicesByUserId(userId: string): Promise<Invoice[]> {
    return await db
      .select()
      .from(invoices)
      .where(eq(invoices.userId, userId))
      .orderBy(desc(invoices.createdAt));
  }

  async updateInvoice(id: number, updates: Partial<InsertInvoice>): Promise<Invoice> {
    const [updated] = await db
      .update(invoices)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(invoices.id, id))
      .returning();
    return updated;
  }

  // Line item operations
  async createLineItems(items: InsertLineItem[]): Promise<LineItem[]> {
    if (items.length === 0) return [];
    return await db.insert(lineItems).values(items).returning();
  }

  async getLineItemsByInvoiceId(invoiceId: number): Promise<LineItem[]> {
    return await db
      .select()
      .from(lineItems)
      .where(eq(lineItems.invoiceId, invoiceId));
  }

  // Approval operations
  async createApproval(approval: InsertApproval): Promise<Approval> {
    const [created] = await db.insert(approvals).values(approval).returning();
    return created;
  }

  async getApprovalsByInvoiceId(invoiceId: number): Promise<Approval[]> {
    return await db
      .select()
      .from(approvals)
      .where(eq(approvals.invoiceId, invoiceId));
  }

  async updateApproval(id: number, updates: Partial<InsertApproval>): Promise<Approval> {
    const [updated] = await db
      .update(approvals)
      .set({ ...updates, approvedAt: new Date() })
      .where(eq(approvals.id, id))
      .returning();
    return updated;
  }

  async getPendingApprovals(): Promise<(Approval & { invoice: Invoice })[]> {
    return await db
      .select({
        id: approvals.id,
        invoiceId: approvals.invoiceId,
        approverId: approvals.approverId,
        status: approvals.status,
        comments: approvals.comments,
        approvedAt: approvals.approvedAt,
        createdAt: approvals.createdAt,
        invoice: invoices,
      })
      .from(approvals)
      .innerJoin(invoices, eq(approvals.invoiceId, invoices.id))
      .where(eq(approvals.status, "pending"))
      .orderBy(desc(approvals.createdAt));
  }

  // Validation rules
  async getValidationRules(): Promise<ValidationRule[]> {
    return await db
      .select()
      .from(validationRules)
      .where(eq(validationRules.isActive, true));
  }

  async createValidationRule(rule: InsertValidationRule): Promise<ValidationRule> {
    const [created] = await db.insert(validationRules).values(rule).returning();
    return created;
  }

  // Dashboard stats
  async getDashboardStats(userId?: string): Promise<{
    totalInvoices: number;
    pendingApproval: number;
    processedToday: number;
    totalValue: string;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const baseQuery = userId 
      ? db.select().from(invoices).where(eq(invoices.userId, userId))
      : db.select().from(invoices);

    // Total invoices
    const [totalResult] = await db
      .select({ count: count() })
      .from(invoices)
      .where(userId ? eq(invoices.userId, userId) : undefined);

    // Pending approvals
    const [pendingResult] = await db
      .select({ count: count() })
      .from(approvals)
      .innerJoin(invoices, eq(approvals.invoiceId, invoices.id))
      .where(
        and(
          eq(approvals.status, "pending"),
          userId ? eq(invoices.userId, userId) : undefined
        )
      );

    // Processed today
    const [processedTodayResult] = await db
      .select({ count: count() })
      .from(invoices)
      .where(
        and(
          sql`DATE(${invoices.updatedAt}) = CURRENT_DATE`,
          userId ? eq(invoices.userId, userId) : undefined
        )
      );

    // Total value
    const [totalValueResult] = await db
      .select({ sum: sum(invoices.totalAmount) })
      .from(invoices)
      .where(userId ? eq(invoices.userId, userId) : undefined);

    return {
      totalInvoices: totalResult.count,
      pendingApproval: pendingResult.count,
      processedToday: processedTodayResult.count,
      totalValue: totalValueResult.sum || "0",
    };
  }
}

export const storage = new DatabaseStorage();
