import { Plus } from "lucide-react";
import { requireBusiness } from "@/lib/tenant";
import { purchaseFilterSchema } from "@/lib/validation/purchase";
import { purchaseService } from "@/services/purchase-service";
import { PageHeader } from "@/components/shared/page-primitives";
import { Pagination } from "@/components/shared/interactive";
import { PurchasesTable, PurchasesToolbar } from "@/components/purchases/purchases-table";
import { PurchaseDrawerTrigger } from "@/components/purchases/purchase-drawer";

export const metadata = { title: "Purchases" };

export default async function PurchasesPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireBusiness();
  const filter = purchaseFilterSchema.parse(await searchParams);

  const [{ items, total, page, totalPages }, { suppliers, products }] = await Promise.all([
    purchaseService.list(ctx, filter),
    purchaseService.getFormOptions(ctx),
  ]);

  return (
    <>
      <PageHeader
        title="Purchases"
        description={`${total} purchase order${total === 1 ? "" : "s"}`}
        actions={
          <PurchaseDrawerTrigger
            suppliers={suppliers}
            products={products}
            label={<><Plus className="size-4" aria-hidden /> New purchase order</>}
          />
        }
      />
      <PurchasesToolbar suppliers={suppliers} />
      <PurchasesTable
        purchases={items.map((p) => ({
          id: p.id,
          purchaseNumber: p.purchaseNumber,
          supplier: p.supplier?.name ?? "—",
          lineCount: p.items.length,
          ordered: p.items.reduce((s, i) => s + i.quantity, 0),
          received: p.items.reduce((s, i) => s + i.receivedQuantity, 0),
          total: Number(p.total),
          status: p.status,
          createdAt: p.createdAt.toISOString(),
        }))}
        currency={ctx.business.currency}
      />
      <Pagination page={page} totalPages={totalPages} />
    </>
  );
}
