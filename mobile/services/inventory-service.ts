import { api } from "./api";

/**
 * Inventory API client. Mirrors src/app/api/inventory/** exactly — no
 * business logic here, only request/response shaping.
 */

export type MovementType = "PURCHASE" | "SALE" | "RETURN" | "ADJUSTMENT" | "INITIAL";

export type InventoryDashboard = {
  totalProducts: number;
  costValue: number;
  retailValue: number;
  outOfStockCount: number;
  lowStockCount: number;
  recentAdjustments: {
    id: string;
    quantity: number;
    quantityBefore: number;
    quantityAfter: number;
    reason: string | null;
    createdAt: string;
    product: { name: string; sku: string | null };
    user: { fullName: string | null; email: string } | null;
  }[];
};

export type InventoryMovement = {
  id: string;
  productId: string;
  userId: string | null;
  type: MovementType;
  quantity: number;
  quantityBefore: number;
  quantityAfter: number;
  reason: string | null;
  createdAt: string;
  product: { id: string; name: string; sku: string | null };
  user: { id: string; fullName: string | null; email: string } | null;
};

export type MovementListResponse = {
  items: InventoryMovement[];
  total: number;
  page: number;
  totalPages: number;
};

export type MovementFilters = {
  q?: string;
  page?: number;
  perPage?: number;
  productId?: string;
  supplierId?: string;
  userId?: string;
  type?: MovementType;
  sortDir?: "asc" | "desc";
};

export type MovementOptions = {
  products: { id: string; name: string }[];
  users: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
};

export type ApiFailureBody = {
  success: false;
  error: { message: string; code: string };
  requestId: string;
};

export function getInventoryErrorMessage(error: unknown, fallback: string): string {
  const body = (error as { response?: { data?: Partial<ApiFailureBody> } })?.response?.data;
  const message = body?.error?.message;
  return typeof message === "string" && message.length > 0 ? message : fallback;
}

function toQueryString(filters: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function getInventoryDashboard(): Promise<InventoryDashboard> {
  const response = await api.get<{ data: InventoryDashboard }>("/inventory/dashboard");
  return response.data.data;
}

export async function getMovements(filters: MovementFilters = {}): Promise<MovementListResponse> {
  const response = await api.get<{ data: MovementListResponse }>(`/inventory/movements${toQueryString(filters)}`);
  return response.data.data;
}

export async function getMovementOptions(): Promise<MovementOptions> {
  const response = await api.get<{ data: MovementOptions }>("/inventory/movements/options");
  return response.data.data;
}
