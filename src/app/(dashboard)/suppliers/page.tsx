import { Plus } from "lucide-react";
import { requireBusiness } from "@/lib/tenant";
import { supplierFilterSchema } from "@/lib/validation/contact";
import { supplierService } from "@/services/supplier-service";
import { PageHeader } from "@/components/shared/page-primitives";
import { Pagination } from "@/components/shared/interactive";
import { SuppliersTable, SuppliersToolbar } from "@/components/suppliers/suppliers-table";
import { ContactDrawer, ContactImportDialog, ContactExportMenu } from "@/components/contacts/shared";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireBusiness();
  const filter = supplierFilterSchema.parse(await searchParams);
  const { items, total, page, totalPages } = await supplierService.list(ctx, filter);

  return (
    <>
      <PageHeader
        title="Suppliers"
        description={`${total} supplier${total === 1 ? "" : "s"}${filter.deleted ? " in trash" : ""}`}
        actions={
          <div className="flex gap-2">
            <ContactImportDialog kind="supplier" />
            <ContactExportMenu type="suppliers" />
            <ContactDrawer kind="supplier" label={<><Plus className="size-4" aria-hidden /> Add supplier</>} />
          </div>
        }
      />
      <SuppliersToolbar />
      <SuppliersTable
        suppliers={items.map((s) => ({
          id: s.id, name: s.name, contactPerson: s.contactPerson,
          phone: s.phone, email: s.email,
          productCount: s._count.products, poCount: s._count.purchases,
          createdAt: s.createdAt.toISOString(),
        }))}
        trashView={filter.deleted}
      />
      <Pagination page={page} totalPages={totalPages} />
    </>
  );
}
