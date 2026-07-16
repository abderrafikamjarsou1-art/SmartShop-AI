import { requireRole } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";
import { Pos } from "@/components/sales/pos";

export const metadata = { title: "Point of Sale" };

/**
 * POS entry — Server Component gate, then the app hands over to a
 * fully client-side POS (a till must feel instant; every calculation
 * runs locally via sale-math, the server is hit only for search and
 * the final createSale).
 */
export default async function PosPage() {
  const ctx = await requireRole("sales:create");

  return (
    <Pos
      currency={ctx.business.currency}
      defaultTaxRate={Number(ctx.business.taxRate)}
      canOverridePrice={hasPermission(ctx.role, "sales:manage")}
    />
  );
}
