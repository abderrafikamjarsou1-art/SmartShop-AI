import { round2 } from "@/lib/sale-math";

/**
 * Financial formulas — PURE functions. The report service fetches raw
 * aggregates (all from IMMUTABLE SNAPSHOTS: SaleItem.unitCost/unitPrice,
 * PurchaseItem.unitCost, Expense rows) and this module turns them into
 * the statement. Accuracy tests target THIS file directly — the math is
 * verifiable without a database.
 *
 * Definitions (documented once, used everywhere):
 *  revenue           gross sales total (incl. tax) in the period
 *  netRevenue        revenue net of returns, EXCL. tax — the honest top line
 *  cogs              cost of net units sold, from SaleItem.unitCost snapshots
 *  grossProfit       netRevenue - cogs
 *  operatingExpenses expense amounts (excl. their tax) in the period
 *  netProfit         grossProfit - operatingExpenses
 *  margins           gross/net profit as % of netRevenue
 */

export interface RawFinancials {
  grossSales: number;        // SUM(sales.total) completed-ish
  netItemRevenue: number;    // SUM(net units share of line totals) — pre-tax base
  taxCollected: number;      // SUM(sales.taxAmount) (approximation note: on gross)
  cogs: number;              // SUM(net units * unitCost snapshot)
  refunds: number;           // SUM(-negative payments)
  expenses: number;          // SUM(expense.amount)
  expenseTax: number;        // SUM(expense.taxAmount)
  purchasesReceived: number; // SUM over receipts (received units * unitCost)
  paymentsIn: number;        // SUM(positive SalePayment + CustomerPayment)
  inventoryValueCost: number;
  outstandingCustomers: number;
  outstandingSuppliers: number;
}

export interface FinancialSummary {
  revenue: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;       // %
  operatingExpenses: number;
  netProfit: number;
  netMargin: number;         // %
  refunds: number;
  taxCollected: number;
  inventoryValue: number;
  outstandingCustomers: number;
  outstandingSuppliers: number;
  cashFlow: {
    inflows: number;         // payments actually received (net of refunds)
    outflows: number;        // expenses paid + stock received
    net: number;
  };
}

export function deriveFinancials(raw: RawFinancials): FinancialSummary {
  const netRevenue = round2(raw.netItemRevenue);
  const cogs = round2(raw.cogs);
  const grossProfit = round2(netRevenue - cogs);
  const operatingExpenses = round2(raw.expenses);
  const netProfit = round2(grossProfit - operatingExpenses);
  const inflows = round2(raw.paymentsIn - raw.refunds);
  const outflows = round2(raw.expenses + raw.expenseTax + raw.purchasesReceived);

  return {
    revenue: round2(raw.grossSales),
    netRevenue,
    cogs,
    grossProfit,
    grossMargin: netRevenue > 0 ? round2((grossProfit / netRevenue) * 100) : 0,
    operatingExpenses,
    netProfit,
    netMargin: netRevenue > 0 ? round2((netProfit / netRevenue) * 100) : 0,
    refunds: round2(raw.refunds),
    taxCollected: round2(raw.taxCollected),
    inventoryValue: round2(raw.inventoryValueCost),
    outstandingCustomers: round2(raw.outstandingCustomers),
    outstandingSuppliers: round2(raw.outstandingSuppliers),
    cashFlow: { inflows, outflows, net: round2(inflows - outflows) },
  };
}
