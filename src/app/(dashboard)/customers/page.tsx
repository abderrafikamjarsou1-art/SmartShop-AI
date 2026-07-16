import { Plus } from "lucide-react";
import { requireBusiness } from "@/lib/tenant";
import { customerFilterSchema } from "@/lib/validation/contact";
import { customerService } from "@/services/customer-service";
import { PageHeader } from "@/components/shared/page-primitives";
import { Pagination } from "@/components/shared/interactive";
import { CustomersTable, CustomersToolbar } from "@/components/customers/customers-table";
import { ContactDrawer, ContactImportDialog, ContactExportMenu } from "@/components/contacts/shared";

export const metadata = { title: "Customers" };

export default async function CustomersPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireBusiness();
  const filter = customerFilterSchema.parse(await searchParams);
  const { items, total, page, totalPages } = await customerService.list(ctx, filter);

  return (
    <>
      <PageHeader
        title="Customers"
        description={`${total} customer${total === 1 ? "" : "s"}${filter.deleted ? " in trash" : ""}`}
        actions={
          <div className="flex gap-2">
            <ContactImportDialog kind="customer" />
            <ContactExportMenu type="customers" />
            <ContactDrawer kind="customer" label={<><Plus className="size-4" aria-hidden /> Add customer</>} />
          </div>
        }
      />
      <CustomersToolbar />
      <CustomersTable
        customers={items.map((c) => ({
          id: c.id, name: c.name, phone: c.phone, email: c.email, tags: c.tags,
          outstandingBalance: Number(c.outstandingBalance), storeCredit: Number(c.storeCredit),
          createdAt: c.createdAt.toISOString(),
        }))}
        currency={ctx.business.currency}
        trashView={filter.deleted}
      />
      <Pagination page={page} totalPages={totalPages} />
    </>
  );
}
