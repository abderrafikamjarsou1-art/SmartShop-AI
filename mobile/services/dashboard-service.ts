import { api } from "./api";

/** Dashboard API client. Mirrors src/app/api/dashboard/route.ts exactly. */

export type DashboardStats = {
  todaySales: number;
  todayDelta: number | null;
  monthSales: number;
  monthDelta: number | null;
  profit: number;
  profitDelta: number | null;
  expenses: number;
  expensesDelta: number | null;
  inventoryValue: number;
  valueAtCost: number;
  valueAtRetail: number;
};

export type MonthlySeriesPoint = { month: string; revenue: number; profit: number };
export type WeeklySeriesPoint = { day: string; sales: number };

export type RecentSale = {
  id: string;
  number: string;
  customer: string;
  total: number;
  items: number;
  createdAt: string;
  paymentStatus: "PENDING" | "PARTIAL" | "PAID" | "REFUNDED";
};

export type LowStockItem = {
  id: string;
  name: string;
  sku: string | null;
  quantity: number;
  minimum: number;
};

export type TopProduct = {
  name: string;
  sku: string | null;
  units: number;
  revenue: number;
  profit: number;
};

export type DashboardData = {
  stats: DashboardStats;
  monthlySeries: MonthlySeriesPoint[];
  weeklySeries: WeeklySeriesPoint[];
  recentSales: RecentSale[];
  lowStock: LowStockItem[];
  topProducts: TopProduct[];
  todayOrderCount: number;
  currency: string;
};

export type ApiFailureBody = {
  success: false;
  error: { message: string; code: string };
  requestId: string;
};

export function getDashboardErrorMessage(error: unknown, fallback: string): string {
  const body = (error as { response?: { data?: Partial<ApiFailureBody> } })?.response?.data;
  const message = body?.error?.message;
  return typeof message === "string" && message.length > 0 ? message : fallback;
}

export async function getDashboard(): Promise<DashboardData> {
  const response = await api.get<{ data: DashboardData }>("/dashboard");
  return response.data.data;
}
