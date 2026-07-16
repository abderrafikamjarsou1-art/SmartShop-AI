import { z } from "zod";
import { zUuid, zMoney, zEmail, zRequiredString, zOptionalString, zPagination } from "@/lib/validation";

/** Customer & Supplier schemas — one file, the shapes rhyme. */

const contactBase = {
  name: zRequiredString("Name", 150),
  email: zEmail.optional().or(z.literal("").transform(() => undefined)),
  phone: zOptionalString(30),
  address: zOptionalString(300),
  notes: zOptionalString(1000),
};

// ---------- Customers ----------
export const createCustomerSchema = z.object({
  ...contactBase,
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.extend({ id: zUuid });

export const customerFilterSchema = zPagination.extend({
  q: z.string().trim().max(100).optional(),  // name / phone / email
  tag: z.string().trim().max(30).optional(),
  balance: z.enum(["all", "owing", "credit"]).default("all"),
  deleted: z.coerce.boolean().default(false),
  sortBy: z.enum(["name", "createdAt", "outstandingBalance"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
export type CustomerFilter = z.infer<typeof customerFilterSchema>;

/** Record a payment against the customer's account (FIFO allocation). */
export const recordPaymentSchema = z.object({
  customerId: zUuid,
  method: z.enum(["CASH", "CARD", "BANK_TRANSFER", "STORE_CREDIT"]),
  amount: zMoney.refine((v) => v > 0, "Amount must be positive."),
  reference: zOptionalString(100),
  notes: zOptionalString(300),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

// ---------- Suppliers ----------
export const createSupplierSchema = z.object({
  ...contactBase,
  contactPerson: zOptionalString(120),
});
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = createSupplierSchema.extend({ id: zUuid });

export const supplierFilterSchema = zPagination.extend({
  q: z.string().trim().max(100).optional(),
  deleted: z.coerce.boolean().default(false),
  sortBy: z.enum(["name", "createdAt"]).default("name"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});
export type SupplierFilter = z.infer<typeof supplierFilterSchema>;

// ---------- CSV import (shared shape) ----------
/** Header: name,phone,email,address,notes[,tags] (tags: "vip|wholesale") */
export const contactCsvRowSchema = z.object({
  name: zRequiredString("Name", 150),
  phone: zOptionalString(30),
  email: zEmail.optional().or(z.literal("").transform(() => undefined)),
  address: zOptionalString(300),
  notes: zOptionalString(1000),
  tags: z.string().trim().max(300).optional(), // pipe-separated for customers
});
export type ContactCsvRow = z.infer<typeof contactCsvRowSchema>;
