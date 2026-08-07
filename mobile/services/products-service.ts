import { api } from "./api";

/**
 * Products API client. Mirrors the shape of src/app/api/products/** and
 * src/lib/validation/product.ts exactly — this file has no business logic
 * of its own, it only calls the API and types the response.
 */

export type ProductStatus = "ACTIVE" | "INACTIVE" | "DISCONTINUED";

export type ProductCategory = {
  id: string;
  name: string;
};

export type ProductSupplier = {
  id: string;
  name: string;
};

export type ProductImage = {
  id: string;
  url: string;
  path: string;
  position: number;
  isPrimary: boolean;
};

/**
 * Shape returned by the API. Money fields are strings — Prisma's Decimal
 * serializes to a string over JSON, never a number (avoids float
 * rounding on money). Parse with Number(...) only at render/math time.
 */
export type Product = {
  id: string;
  businessId: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  categoryId: string | null;
  supplierId: string | null;
  buyingPrice: string;
  sellingPrice: string;
  quantity: number;
  minimumStock: number;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  category: ProductCategory | null;
  supplier: ProductSupplier | null;
  images: ProductImage[];
};

export type ProductListResponse = {
  items: Product[];
  total: number;
  page: number;
  totalPages: number;
};

export type ProductFilters = {
  q?: string;
  page?: number;
  perPage?: number;
  categoryId?: string;
  supplierId?: string;
  status?: ProductStatus;
  stock?: "all" | "in" | "low" | "out";
  sortBy?: "name" | "sellingPrice" | "buyingPrice" | "quantity" | "createdAt";
  sortDir?: "asc" | "desc";
};

/** Fields the create form actually collects (images aren't part of this screen). */
export type CreateProductInput = {
  name: string;
  sku?: string;
  barcode?: string;
  categoryId?: string;
  supplierId?: string;
  buyingPrice: number;
  sellingPrice: number;
  quantity: number;
  minimumStock: number;
  status: ProductStatus;
  allowLoss?: boolean;
};

/**
 * Same fields as create. `quantity` is required here because the
 * server's updateProductSchema still requires it — but
 * productService.update() never writes it to the database (stock only
 * changes through adjustStock). The edit screen always sends the
 * product's current, unmodified quantity back — this type exists so
 * that contract is explicit rather than accidentally omitted.
 */
export type UpdateProductInput = {
  name: string;
  sku?: string;
  barcode?: string;
  categoryId?: string;
  supplierId?: string;
  buyingPrice: number;
  sellingPrice: number;
  quantity: number;
  minimumStock: number;
  status: ProductStatus;
  allowLoss?: boolean;
};

export type AdjustStockInput = {
  newQuantity: number;
  reason: string;
};

export type ProductOptions = {
  categories: ProductCategory[];
  suppliers: ProductSupplier[];
};

export type ApiFailureBody = {
  success: false;
  error: { message: string; code: string; fieldErrors?: Record<string, string[]> };
  requestId: string;
};

/** Extracts a readable message from a backend error response, with a safe fallback. */
export function getProductErrorMessage(error: unknown, fallback: string): string {
  const body = (error as { response?: { data?: Partial<ApiFailureBody> } })?.response?.data;
  const message = body?.error?.message;
  return typeof message === "string" && message.length > 0 ? message : fallback;
}

/** Field-level validation errors, if the backend returned any (empty object if none). */
export function getProductFieldErrors(error: unknown): Record<string, string[]> {
  const body = (error as { response?: { data?: Partial<ApiFailureBody> } })?.response?.data;
  return body?.error?.fieldErrors ?? {};
}

function toQueryString(filters: ProductFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function getProducts(filters: ProductFilters = {}): Promise<ProductListResponse> {
  const response = await api.get<{ data: ProductListResponse }>(`/products${toQueryString(filters)}`);
  return response.data.data;
}

export async function getProductOptions(): Promise<ProductOptions> {
  const response = await api.get<{ data: ProductOptions }>("/products/options");
  return response.data.data;
}

export async function getProduct(id: string): Promise<Product> {
  const response = await api.get<{ data: Product }>(`/products/${id}`);
  return response.data.data;
}

export async function createProduct(data: CreateProductInput): Promise<Product> {
  const response = await api.post<{ data: Product }>("/products", data);
  return response.data.data;
}

export async function updateProduct(id: string, data: UpdateProductInput): Promise<Product> {
  const response = await api.patch<{ data: Product }>(`/products/${id}`, data);
  return response.data.data;
}

export async function adjustStock(id: string, data: AdjustStockInput): Promise<Product> {
  const response = await api.post<{ data: Product }>(`/products/${id}/stock`, data);
  return response.data.data;
}

export async function deleteProduct(id: string): Promise<{ count: number }> {
  const response = await api.delete<{ data: { count: number } }>(`/products/${id}`);
  return response.data.data;
}
