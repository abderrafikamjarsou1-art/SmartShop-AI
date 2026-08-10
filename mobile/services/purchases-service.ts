import { api } from "./api";

/**
 * Purchases API client. Mirrors src/app/api/purchases/** and
 * src/lib/validation/purchase.ts exactly — no business logic here.
 */

export type PurchaseStatus = "DRAFT" | "ORDERED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";

export type PurchaseItem = {
  id: string;
  productId: string;
  quantity: number;
  receivedQuantity: number;
  returnedQuantity: number;
  unitCost: string;
  total: string;
  product: { id: string; name: string; sku: string | null };
};

export type PurchaseReceipt = {
  id: string;
  clientRef: string;
  lines: { purchaseItemId: string; quantity: number }[];
  notes: string | null;
  createdAt: string;
};

export type Purchase = {
  id: string;
  businessId: string;
  supplierId: string | null;
  userId: string | null;
  purchaseNumber: number;
  status: PurchaseStatus;
  paymentStatus: string;
  subtotal: string;
  taxAmount: string;
  total: string;
  sentAt: string | null;
  expectedAt: string | null;
  receivedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  supplier: { id: string; name: string; email: string | null; phone: string | null } | null;
  user: { fullName: string | null; email: string } | null;
  items: PurchaseItem[];
  receipts: PurchaseReceipt[];
};

/** Lighter shape returned by the list endpoint (no full item/receipt detail). */
export type PurchaseListItem = {
  id: string;
  purchaseNumber: number;
  status: PurchaseStatus;
  total: string;
  createdAt: string;
  expectedAt: string | null;
  supplier: { name: string } | null;
  items: { quantity: number; receivedQuantity: number }[];
};

export type PurchaseListResponse = {
  items: PurchaseListItem[];
  total: number;
  page: number;
  totalPages: number;
};

export type PurchaseFilters = {
  q?: string;
  page?: number;
  perPage?: number;
  status?: PurchaseStatus;
  supplierId?: string;
  sortDir?: "asc" | "desc";
};

export type PurchaseItemInput = {
  productId: string;
  quantity: number;
  unitCost: number;
};

export type CreatePurchaseInput = {
  supplierId: string;
  status?: "DRAFT" | "ORDERED";
  items: PurchaseItemInput[];
  expectedAt?: string;
  notes?: string;
};

export type UpdateDraftPurchaseInput = {
  supplierId: string;
  items: PurchaseItemInput[];
  expectedAt?: string;
  notes?: string;
};

export type ReceiveLineInput = { purchaseItemId: string; quantity: number };

export type ReceivePurchaseInput = {
  clientRef: string;
  items: ReceiveLineInput[];
  updateProductCost?: boolean;
  notes?: string;
};

export type ReturnPurchaseInput = {
  items: ReceiveLineInput[];
  reason: string;
};

export type PurchaseOptions = {
  suppliers: { id: string; name: string }[];
  products: { id: string; name: string; sku: string | null; buyingPrice: number }[];
};

export type ApiFailureBody = {
  success: false;
  error: { message: string; code: string; fieldErrors?: Record<string, string[]> };
  requestId: string;
};

export function getPurchaseErrorMessage(error: unknown, fallback: string): string {
  const body = (error as { response?: { data?: Partial<ApiFailureBody> } })?.response?.data;
  const message = body?.error?.message;
  return typeof message === "string" && message.length > 0 ? message : fallback;
}

export function getPurchaseFieldErrors(error: unknown): Record<string, string[]> {
  const body = (error as { response?: { data?: Partial<ApiFailureBody> } })?.response?.data;
  return body?.error?.fieldErrors ?? {};
}

/**
 * Idempotency key generator for receive events — doesn't need to be
 * cryptographically secure, just unique per receive attempt, and stable
 * across a retry of that SAME attempt (see the POS's generateClientRef
 * for the identical pattern and reasoning).
 */
export function generateClientRef(): string {
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return template.replace(/[xy]/g, (c) => {
    if (c === "y") return ((Math.floor(Math.random() * 4) + 8) % 16).toString(16);
    return hex();
  });
}

function toQueryString(filters: PurchaseFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function getPurchases(filters: PurchaseFilters = {}): Promise<PurchaseListResponse> {
  const response = await api.get<{ data: PurchaseListResponse }>(`/purchases${toQueryString(filters)}`);
  return response.data.data;
}

export async function getPurchaseOptions(): Promise<PurchaseOptions> {
  const response = await api.get<{ data: PurchaseOptions }>("/purchases/options");
  return response.data.data;
}

export async function getPurchase(id: string): Promise<Purchase> {
  const response = await api.get<{ data: Purchase }>(`/purchases/${id}`);
  return response.data.data;
}

export async function createPurchase(data: CreatePurchaseInput): Promise<Purchase> {
  const response = await api.post<{ data: Purchase }>("/purchases", data);
  return response.data.data;
}

export async function updateDraftPurchase(id: string, data: UpdateDraftPurchaseInput): Promise<Purchase> {
  const response = await api.patch<{ data: Purchase }>(`/purchases/${id}`, data);
  return response.data.data;
}

export async function sendPurchase(id: string): Promise<Purchase> {
  const response = await api.post<{ data: Purchase }>(`/purchases/${id}/send`);
  return response.data.data;
}

export async function cancelPurchase(id: string): Promise<Purchase> {
  const response = await api.post<{ data: Purchase }>(`/purchases/${id}/cancel`);
  return response.data.data;
}

export async function receivePurchase(id: string, data: ReceivePurchaseInput): Promise<Purchase> {
  const response = await api.post<{ data: Purchase }>(`/purchases/${id}/receive`, data);
  return response.data.data;
}

export async function returnPurchase(id: string, data: ReturnPurchaseInput): Promise<Purchase> {
  const response = await api.post<{ data: Purchase }>(`/purchases/${id}/return`, data);
  return response.data.data;
}
