import { api } from "./api";

/**
 * Sales/POS API client. Mirrors src/app/api/sales/route.ts and
 * src/lib/validation/sale.ts exactly. All money/stock/idempotency
 * invariants live server-side in saleService — this file only shapes
 * the request/response.
 */

export type PaymentMethod = "CASH" | "CARD" | "BANK_TRANSFER" | "STORE_CREDIT";
export type SaleStatus = "DRAFT" | "COMPLETED" | "PARTIALLY_RETURNED" | "RETURNED" | "VOIDED" | "CANCELLED";
export type PaymentStatus = "PENDING" | "PARTIAL" | "PAID" | "REFUNDED";

export type SaleItemInput = {
  productId: string;
  quantity: number;
  discountAmount?: number;
};

export type PaymentInput = {
  method: PaymentMethod;
  amount: number;
  reference?: string;
};

export type CreateSaleInput = {
  clientRef: string;
  customerId?: string;
  status?: "DRAFT" | "COMPLETED";
  items: SaleItemInput[];
  globalDiscount?: number;
  taxRate?: number;
  notes?: string;
  payments: PaymentInput[];
};

export type SaleItem = {
  id: string;
  productId: string;
  quantity: number;
  returnedQuantity: number;
  unitPrice: string;
  unitCost: string;
  discountAmount: string;
  total: string;
  product: { id: string; name: string; sku: string | null };
};

export type SalePayment = {
  id: string;
  method: PaymentMethod;
  amount: string;
  reference: string | null;
  createdAt: string;
};

export type SaleInvoice = {
  id: string;
  invoiceNumber: number;
  issuedAt: string;
};

export type Sale = {
  id: string;
  businessId: string;
  customerId: string | null;
  userId: string | null;
  saleNumber: number;
  clientRef: string | null;
  status: SaleStatus;
  paymentStatus: PaymentStatus;
  subtotal: string;
  discountAmount: string;
  taxRate: string;
  taxAmount: string;
  total: string;
  amountPaid: string;
  notes: string | null;
  createdAt: string;
  items: SaleItem[];
  customer: { id: string; name: string; phone: string | null; email: string | null } | null;
  user: { id: string; fullName: string | null; email: string } | null;
  payments: SalePayment[];
  invoice: SaleInvoice | null;
};

export type ApiFailureBody = {
  success: false;
  error: { message: string; code: string; fieldErrors?: Record<string, string[]> };
  requestId: string;
};

export function getSaleErrorMessage(error: unknown, fallback: string): string {
  const body = (error as { response?: { data?: Partial<ApiFailureBody> } })?.response?.data;
  const message = body?.error?.message;
  return typeof message === "string" && message.length > 0 ? message : fallback;
}

/**
 * Idempotency key generator. Doesn't need to be cryptographically secure
 * — just unique enough that a retried checkout after a dropped connection
 * reuses the same key (see createSale's caller) instead of double-charging.
 */
export function generateClientRef(): string {
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return template.replace(/[xy]/g, (c) => {
    if (c === "y") return ((Math.floor(Math.random() * 4) + 8) % 16).toString(16);
    return hex();
  });
}

export async function createSale(input: CreateSaleInput): Promise<Sale> {
  const response = await api.post<{ data: Sale }>("/sales", input);
  return response.data.data;
}
