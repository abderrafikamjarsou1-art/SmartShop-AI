import { api } from "./api";

/**
 * Expenses API client. Mirrors src/app/api/expenses/** and
 * src/lib/validation/expense.ts exactly — no business logic here.
 *
 * Receipt attachments are read-only on mobile: there is no Supabase
 * Storage client in this app (web uploads receipts directly to Supabase
 * Storage from the browser). Existing attachment URLs are shown, but
 * uploading new ones is out of scope for this pass.
 */

export type ExpenseCategory =
  | "RENT"
  | "UTILITIES"
  | "SALARIES"
  | "MARKETING"
  | "SUPPLIES"
  | "TRANSPORT"
  | "MAINTENANCE"
  | "TAXES"
  | "INSURANCE"
  | "OTHER";

export type ExpensePaymentMethod = "CASH" | "CARD" | "BANK_TRANSFER";

export type RecurrenceInterval = "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";

export type ExpenseAttachment = { url: string; path: string; name: string; mimeType: string };

/** Lighter shape returned by the list endpoint (supplier/user name only). */
export type ExpenseListItem = {
  id: string;
  category: ExpenseCategory;
  title: string;
  amount: string;
  taxAmount: string;
  paymentMethod: ExpensePaymentMethod | null;
  date: string;
  notes: string | null;
  attachments: ExpenseAttachment[];
  isRecurring: boolean;
  recurrenceInterval: RecurrenceInterval | null;
  nextOccurrence: string | null;
  templateId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  supplier: { name: string } | null;
  user: { fullName: string | null } | null;
};

/** Full shape returned by getById — supplier id+name, no user relation. */
export type Expense = {
  id: string;
  category: ExpenseCategory;
  title: string;
  amount: string;
  taxAmount: string;
  paymentMethod: ExpensePaymentMethod | null;
  date: string;
  notes: string | null;
  receiptUrl: string | null;
  attachments: ExpenseAttachment[];
  isRecurring: boolean;
  recurrenceInterval: RecurrenceInterval | null;
  nextOccurrence: string | null;
  templateId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  supplier: { id: string; name: string } | null;
};

export type ExpenseListResponse = {
  items: ExpenseListItem[];
  total: number;
  page: number;
  totalPages: number;
  sumAmount: number;
  sumTax: number;
};

export type ExpenseFilters = {
  q?: string;
  category?: ExpenseCategory;
  supplierId?: string;
  from?: string;
  to?: string;
  deleted?: boolean;
  recurring?: boolean;
  page?: number;
  perPage?: number;
};

export type ExpenseInput = {
  title: string;
  category: ExpenseCategory;
  amount: number;
  taxAmount?: number;
  date: string;
  supplierId?: string;
  paymentMethod?: ExpensePaymentMethod;
  notes?: string;
  isRecurring?: boolean;
  recurrenceInterval?: RecurrenceInterval;
};

export type ExpenseOptions = {
  suppliers: { id: string; name: string }[];
};

export type ApiFailureBody = {
  success: false;
  error: { message: string; code: string; fieldErrors?: Record<string, string[]> };
  requestId: string;
};

export function getExpenseErrorMessage(error: unknown, fallback: string): string {
  const body = (error as { response?: { data?: Partial<ApiFailureBody> } })?.response?.data;
  const message = body?.error?.message;
  return typeof message === "string" && message.length > 0 ? message : fallback;
}

export function getExpenseFieldErrors(error: unknown): Record<string, string[]> {
  const body = (error as { response?: { data?: Partial<ApiFailureBody> } })?.response?.data;
  return body?.error?.fieldErrors ?? {};
}

function toQueryString(filters: ExpenseFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function getExpenses(filters: ExpenseFilters = {}): Promise<ExpenseListResponse> {
  const response = await api.get<{ data: ExpenseListResponse }>(`/expenses${toQueryString(filters)}`);
  return response.data.data;
}

export async function getExpenseOptions(): Promise<ExpenseOptions> {
  const response = await api.get<{ data: ExpenseOptions }>("/expenses/options");
  return response.data.data;
}

export async function getExpense(id: string): Promise<Expense> {
  const response = await api.get<{ data: Expense }>(`/expenses/${id}`);
  return response.data.data;
}

export async function createExpense(data: ExpenseInput): Promise<Expense> {
  const response = await api.post<{ data: Expense }>("/expenses", data);
  return response.data.data;
}

export async function updateExpense(id: string, data: ExpenseInput): Promise<Expense> {
  const response = await api.patch<{ data: Expense }>(`/expenses/${id}`, data);
  return response.data.data;
}

export async function deleteExpense(id: string): Promise<Expense> {
  const response = await api.delete<{ data: Expense }>(`/expenses/${id}`);
  return response.data.data;
}

export async function restoreExpense(id: string): Promise<Expense> {
  const response = await api.post<{ data: Expense }>(`/expenses/${id}/restore`);
  return response.data.data;
}
