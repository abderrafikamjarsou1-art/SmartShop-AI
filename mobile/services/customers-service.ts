import { api } from "./api";

/**
 * Customers API client. Mirrors src/app/api/customers/** and
 * src/lib/validation/contact.ts exactly — no business logic here.
 */

export type PaymentMethod = "CASH" | "CARD" | "BANK_TRANSFER" | "STORE_CREDIT";

export type Customer = {
  id: string;
  businessId: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  tags: string[];
  storeCredit: string;
  outstandingBalance: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type CustomerListResponse = {
  items: Customer[];
  total: number;
  page: number;
  totalPages: number;
};

export type CustomerFilters = {
  q?: string;
  page?: number;
  perPage?: number;
  tag?: string;
  balance?: "all" | "owing" | "credit";
  sortBy?: "name" | "createdAt" | "outstandingBalance";
  sortDir?: "asc" | "desc";
};

export type CreateCustomerInput = {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  tags?: string[];
};

export type UpdateCustomerInput = CreateCustomerInput;

export type CustomerFavoriteProduct = { name: string; units: number };

export type CustomerRecentSale = {
  id: string;
  saleNumber: number;
  status: string;
  paymentStatus: string;
  total: string;
  amountPaid: string;
  createdAt: string;
  invoice: { invoiceNumber: number } | null;
};

export type CustomerPaymentRecord = {
  id: string;
  method: PaymentMethod;
  amount: string;
  reference: string | null;
  notes: string | null;
  createdAt: string;
};

export type CustomerProfile = {
  customer: Customer;
  kpis: {
    ltv: number;
    orders: number;
    aov: number;
    lastPurchase: string | null;
    outstandingBalance: number;
    storeCredit: number;
  };
  favorites: CustomerFavoriteProduct[];
  recentSales: CustomerRecentSale[];
  payments: CustomerPaymentRecord[];
};

export type RecordPaymentInput = {
  method: PaymentMethod;
  amount: number;
  reference?: string;
  notes?: string;
};

export type RecordPaymentResult = {
  payment: CustomerPaymentRecord;
  allocations: { saleId: string; saleNumber: number; amount: number }[];
};

export type ApiFailureBody = {
  success: false;
  error: { message: string; code: string; fieldErrors?: Record<string, string[]> };
  requestId: string;
};

export function getCustomerErrorMessage(error: unknown, fallback: string): string {
  const body = (error as { response?: { data?: Partial<ApiFailureBody> } })?.response?.data;
  const message = body?.error?.message;
  return typeof message === "string" && message.length > 0 ? message : fallback;
}

export function getCustomerFieldErrors(error: unknown): Record<string, string[]> {
  const body = (error as { response?: { data?: Partial<ApiFailureBody> } })?.response?.data;
  return body?.error?.fieldErrors ?? {};
}

function toQueryString(filters: CustomerFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function getCustomers(filters: CustomerFilters = {}): Promise<CustomerListResponse> {
  const response = await api.get<{ data: CustomerListResponse }>(`/customers${toQueryString(filters)}`);
  return response.data.data;
}

export async function getCustomerProfile(id: string): Promise<CustomerProfile> {
  const response = await api.get<{ data: CustomerProfile }>(`/customers/${id}`);
  return response.data.data;
}

export async function createCustomer(data: CreateCustomerInput): Promise<Customer> {
  const response = await api.post<{ data: Customer }>("/customers", data);
  return response.data.data;
}

export async function updateCustomer(id: string, data: UpdateCustomerInput): Promise<Customer> {
  const response = await api.patch<{ data: Customer }>(`/customers/${id}`, data);
  return response.data.data;
}

export async function deleteCustomer(id: string): Promise<{ id: string }> {
  const response = await api.delete<{ data: { id: string } }>(`/customers/${id}`);
  return response.data.data;
}

export async function recordCustomerPayment(id: string, data: RecordPaymentInput): Promise<RecordPaymentResult> {
  const response = await api.post<{ data: RecordPaymentResult }>(`/customers/${id}/payment`, data);
  return response.data.data;
}
