import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { api } from "./api";

/**
 * Reports API client. Mirrors src/app/api/reports/summary/route.ts and
 * src/app/api/reports/export/route.ts exactly — no aggregation logic
 * here, only request/response shaping and, for exports, saving the
 * returned file locally and handing it to the OS share sheet (there is
 * no browser to download through on native).
 */

export type ReportPreset = "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "custom";

export type FinancialSummary = {
  revenue: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  operatingExpenses: number;
  netProfit: number;
  netMargin: number;
  refunds: number;
  taxCollected: number;
  inventoryValue: number;
  outstandingCustomers: number;
  outstandingSuppliers: number;
  cashFlow: { inflows: number; outflows: number; net: number };
};

export type FinancialDeltas = {
  netRevenue: number | null;
  grossProfit: number | null;
  netProfit: number | null;
  expenses: number | null;
};

export type TopProduct = {
  name: string;
  sku: string | null;
  units: number;
  revenue: number;
  profit: number;
};

export type ReportPeriodInfo = {
  label: string;
  from: string;
  to: string;
  preset: ReportPreset;
};

export type ReportSummary = {
  period: ReportPeriodInfo;
  summary: FinancialSummary;
  deltas: FinancialDeltas;
  topProducts: TopProduct[];
};

export type ReportPeriodParams = {
  preset: ReportPreset;
  /** yyyy-mm-dd — required when preset === "custom" */
  from?: string;
  to?: string;
};

export type ExportReportType =
  | "financial-summary"
  | "top-products"
  | "top-customers"
  | "sales-by-employee"
  | "payment-methods"
  | "refunds"
  | "purchases"
  | "expenses"
  | "low-stock"
  | "inventory-valuation";

export type ExportFormat = "xlsx" | "pdf";

const EXPORT_MIME_TYPES: Record<ExportFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

const EXPORT_LABELS: Record<ExportReportType, string> = {
  "financial-summary": "الملخص المالي",
  "top-products": "الأكثر مبيعًا",
  "top-customers": "أفضل العملاء",
  "sales-by-employee": "المبيعات حسب الموظف",
  "payment-methods": "طرق الدفع",
  refunds: "المرتجعات",
  purchases: "المشتريات",
  expenses: "المصاريف",
  "low-stock": "المخزون المنخفض",
  "inventory-valuation": "تقييم المخزون",
};

export type ApiFailureBody = {
  success: false;
  error: { message: string; code: string };
  requestId: string;
};

export function getReportErrorMessage(error: unknown, fallback: string): string {
  const body = (error as { response?: { data?: Partial<ApiFailureBody> } })?.response?.data;
  const message = body?.error?.message;
  return typeof message === "string" && message.length > 0 ? message : fallback;
}

function periodQuery(period: ReportPeriodParams): URLSearchParams {
  const query = new URLSearchParams();
  query.set("preset", period.preset);
  if (period.from) query.set("from", period.from);
  if (period.to) query.set("to", period.to);
  return query;
}

export async function getReportSummary(period: ReportPeriodParams): Promise<ReportSummary> {
  const response = await api.get<{ data: ReportSummary }>(`/reports/summary?${periodQuery(period).toString()}`);
  return response.data.data;
}

/**
 * Requests the PDF/Excel export from the server, writes the returned
 * bytes to a local file, and hands it to the native share sheet — the
 * React Native equivalent of a browser file download. Throws with a
 * user-facing Arabic message if sharing isn't available on this device.
 */
export async function exportAndShareReport(
  report: ExportReportType,
  format: ExportFormat,
  period: ReportPeriodParams
): Promise<void> {
  const query = periodQuery(period);
  query.set("report", report);
  query.set("format", format);

  const response = await api.get<ArrayBuffer>(`/reports/export?${query.toString()}`, {
    responseType: "arraybuffer",
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${report}-${stamp}.${format}`;
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true, intermediates: true });
  file.write(new Uint8Array(response.data));

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("المشاركة غير متاحة على هذا الجهاز.");
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: EXPORT_MIME_TYPES[format],
    dialogTitle: EXPORT_LABELS[report],
    UTI: format === "pdf" ? "com.adobe.pdf" : "org.openxmlformats.spreadsheetml.sheet",
  });
}
