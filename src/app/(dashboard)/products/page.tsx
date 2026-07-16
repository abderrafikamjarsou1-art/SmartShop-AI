import { Plus } from "lucide-react";
import { requireBusiness } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";
import { productFilterSchema } from "@/lib/validation/product";
import { productService } from "@/services/product-service";
import { PageHeader } from "@/components/shared/page-primitives";
import { Pagination } from "@/components/shared/interactive";
import { ProductsToolbar } from "@/components/products/toolbar";
import { ProductsTable } from "@/components/products/products-table";
import { ProductDrawerTrigger } from "@/components/products/product-drawer";

export const metadata = { title: "Products" };

/**
 * Products list — Server Component.
 * The URL is the state: search, filters, sort and page all live in
 * searchParams, get validated by productFilterSchema, and drive the
 * Prisma query. Sharable, refreshable, zero client fetching.
 */
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireBusiness();
  const filter = productFilterSchema.parse(await searchParams);

  const [{ items, total, page, totalPages }, options] = await Promise.all([
    productService.list(ctx, filter),
    productService.getFilterOptions(ctx),
  ]);

  const canManage = hasPermission(ctx.role, "products:manage");

  return (
    <>
      <PageHeader
        title="Products"
        description={`${total} product${total === 1 ? "" : "s"}${filter.deleted ? " in trash" : ""}`}
        actions={canManage && !filter.deleted && (
          <ProductDrawerTrigger
            categories={options.categories}
            suppliers={options.suppliers}
            label={<><Plus className="size-4" aria-hidden /> Add product</>}
          />
        )}
      />

      <ProductsToolbar categories={options.categories} suppliers={options.suppliers} />

      <ProductsTable
        products={items.map(serializeProduct)}
        canManage={canManage}
        isSuperAdmin={ctx.user.isSuperAdmin}
        trashView={filter.deleted}
        currency={ctx.business.currency}
        categories={options.categories}
        suppliers={options.suppliers}
      />

      <Pagination page={page} totalPages={totalPages} />
    </>
  );
}

/** Decimal -> number for the client boundary (Prisma Decimal isn't serializable). */
function serializeProduct(p: Awaited<ReturnType<typeof productService.list>>["items"][number]) {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    category: p.category,
    supplier: p.supplier,
    buyingPrice: Number(p.buyingPrice),
    sellingPrice: Number(p.sellingPrice),
    quantity: p.quantity,
    minimumStock: p.minimumStock,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    images: p.images.map((i) => ({ url: i.url, path: i.path })),
  };
}
export type ProductRow = ReturnType<typeof serializeProduct>;
