import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { syncLowStockAlert } from "@/services/stock-alerts";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant";
import type {
  CreateProductInput, UpdateProductInput, AdjustStockInput, ProductFilter,
} from "@/lib/validation/product";

/**
 * Product service — ALL product business logic lives here.
 * Contract with the rest of the app:
 *  - every method takes TenantContext first; every query is scoped by ctx.businessId
 *  - throws ApiError subclasses; never returns raw Prisma errors
 *  - multi-write operations are transactions (atomic or nothing)
 *
 * This file is the template for every future service.
 */

// Reused SELECT — one shape for list + detail keeps the UI types simple.
const productInclude = {
  category: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
  images: { orderBy: { position: "asc" as const } },
} satisfies Prisma.ProductInclude;

export type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

/**
 * Verify a categoryId/supplierId belong to the tenant before they're ever
 * written onto a product. Without this, a client could link a product to
 * another business's category/supplier row, leaking that row's name (and
 * id) through every subsequent product read via `productInclude`.
 */
async function verifyProductRelations(
  ctx: TenantContext,
  categoryId: string | null | undefined,
  supplierId: string | null | undefined
) {
  const [category, supplier] = await Promise.all([
    categoryId
      ? prisma.category.findFirst({ where: { id: categoryId, businessId: ctx.businessId, deletedAt: null } })
      : Promise.resolve(true),
    supplierId
      ? prisma.supplier.findFirst({ where: { id: supplierId, businessId: ctx.businessId, deletedAt: null } })
      : Promise.resolve(true),
  ]);
  if (categoryId && !category) throw new NotFoundError("Category");
  if (supplierId && !supplier) throw new NotFoundError("Supplier");
}

/** Map Prisma unique-violation into a friendly, field-aware ConflictError. */
function mapUniqueError(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    const target = String(e.meta?.target ?? "");
    if (target.includes("sku")) throw new ConflictError("A product with this SKU already exists.");
    if (target.includes("barcode")) throw new ConflictError("A product with this barcode already exists.");
    throw new ConflictError();
  }
  throw e;
}

export const productService = {
  // ---------------------------------------------------------------
  // LIST — server pagination + search + filters + sort
  // ---------------------------------------------------------------
  async list(ctx: TenantContext, filter: ProductFilter) {
    const where: Prisma.ProductWhereInput = {
      businessId: ctx.businessId,                       // TENANT SCOPE — always first
      deletedAt: filter.deleted ? { not: null } : null, // active vs trash view
      ...(filter.categoryId && { categoryId: filter.categoryId }),
      ...(filter.supplierId && { supplierId: filter.supplierId }),
      ...(filter.status && { status: filter.status }),
      // Fast search on the three indexed identity fields
      ...(filter.q && {
        OR: [
          { name: { contains: filter.q, mode: "insensitive" } },
          { sku: { contains: filter.q, mode: "insensitive" } },
          { barcode: { contains: filter.q, mode: "insensitive" } },
        ],
      }),
      // Stock filter — "low" compares quantity to the row's own minimumStock
      ...(filter.stock === "out" && { quantity: 0 }),
      ...(filter.stock === "in" && { quantity: { gt: 0 } }),
      ...(filter.stock === "low" && {
        quantity: { gt: 0 },
        // Prisma can't compare two columns in WHERE — raw expression via
        // AND on a filtered id list would be slow; instead use the SQL
        // fragment through Prisma's relation-free workaround:
        // simplest robust approach = fetch with quantity <= max(minimumStock)
        // is wrong, so we use $queryRaw for ids. See lowStockIds below.
        id: { in: await lowStockIds(ctx.businessId) },
      }),
    };

    const [items, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: { [filter.sortBy]: filter.sortDir },
        skip: (filter.page - 1) * filter.perPage,
        take: filter.perPage,
      }),
      prisma.product.count({ where }),
    ]);

    return {
      items,
      total,
      page: filter.page,
      totalPages: Math.max(1, Math.ceil(total / filter.perPage)),
    };
  },

  // ---------------------------------------------------------------
  // READ
  // ---------------------------------------------------------------
  async getById(ctx: TenantContext, id: string): Promise<ProductWithRelations> {
    // findFirst with businessId (NOT findUnique by id alone) = tenant safety
    const product = await prisma.product.findFirst({
      where: { id, businessId: ctx.businessId },
      include: productInclude,
    });
    if (!product) throw new NotFoundError("Product");
    return product;
  },

  /** Options for the filter bar (categories + suppliers of this tenant). */
  async getFilterOptions(ctx: TenantContext) {
    const [categories, suppliers] = await Promise.all([
      prisma.category.findMany({
        where: { businessId: ctx.businessId, deletedAt: null },
        select: { id: true, name: true }, orderBy: { name: "asc" },
      }),
      prisma.supplier.findMany({
        where: { businessId: ctx.businessId, deletedAt: null },
        select: { id: true, name: true }, orderBy: { name: "asc" },
      }),
    ]);
    return { categories, suppliers };
  },

  // ---------------------------------------------------------------
  // CREATE — atomic: product + images + INITIAL movement + audit
  // ---------------------------------------------------------------
  async create(ctx: TenantContext, input: CreateProductInput) {
    await verifyProductRelations(ctx, input.categoryId, input.supplierId);
    try {
      return await prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            businessId: ctx.businessId,
            name: input.name,
            sku: input.sku ?? null,
            barcode: input.barcode ?? null,
            categoryId: input.categoryId ?? null,
            supplierId: input.supplierId ?? null,
            buyingPrice: input.buyingPrice,
            sellingPrice: input.sellingPrice,
            quantity: input.quantity,
            minimumStock: input.minimumStock,
            status: input.status,
            images: {
  create: input.images.map(
    (
      img: { url: string; path: string },
      i: number
    ) => ({
      url: img.url,
      path: img.path,
      position: i,
      isPrimary: i === 0,
    })
  ),
},
          },
        });

        // Opening stock -> INITIAL ledger entry (inventory history starts at day 0)
        if (input.quantity > 0) {
          await tx.inventoryMovement.create({
            data: {
              businessId: ctx.businessId,
              productId: product.id,
              userId: ctx.user.id,
              type: "INITIAL",
              quantity: input.quantity,
              quantityBefore: 0,
              quantityAfter: input.quantity,
              reason: "Opening stock",
            },
          });
        }

        await audit(tx, ctx, "product.create", "Product", product.id, {
          name: product.name, sku: product.sku, quantity: input.quantity,
        });

        return product;
      });
    } catch (e) {
      mapUniqueError(e);
    }
  },

  // ---------------------------------------------------------------
  // UPDATE — atomic: fields + image diff + audit (with before/after)
  // Note: quantity is NOT updatable here — stock changes only through
  // adjustStock/sales/purchases, so the ledger always explains the number.
  // ---------------------------------------------------------------
  async update(ctx: TenantContext, input: UpdateProductInput) {
    const existing = await this.getById(ctx, input.id);
    await verifyProductRelations(ctx, input.categoryId, input.supplierId);

    try {
      return await prisma.$transaction(async (tx) => {
        // Image sync: delete removed, keep existing, add new — atomic
const keepPaths = new Set<string>(
  input.images.map((img: { path: string }) => img.path)
);

const existingByPath = new Map(
  existing.images.map((img) => [img.path, img] as const)
);

await tx.productImage.deleteMany({
  where: {
    productId: input.id,
    path: {
      notIn: Array.from(keepPaths),
    },
  },
});

for (const [i, img] of input.images.entries()) {
  const found = existingByPath.get(img.path);

  if (found) {
    await tx.productImage.update({
      where: { id: found.id },
      data: {
        position: i,
        isPrimary: i === 0,
      },
    });
  } else {
    await tx.productImage.create({
      data: {
        productId: input.id,
        url: img.url,
        path: img.path,
        position: i,
        isPrimary: i === 0,
      },
    });
  }
}

        const product = await tx.product.update({
          where: { id: input.id }, // safe: getById already proved tenant ownership
          data: {
            name: input.name,
            sku: input.sku ?? null,
            barcode: input.barcode ?? null,
            categoryId: input.categoryId ?? null,
            supplierId: input.supplierId ?? null,
            buyingPrice: input.buyingPrice,
            sellingPrice: input.sellingPrice,
            minimumStock: input.minimumStock,
            status: input.status,
          },
        });

        await audit(tx, ctx, "product.update", "Product", product.id, {
          before: { name: existing.name, sellingPrice: existing.sellingPrice.toString() },
          after: { name: product.name, sellingPrice: product.sellingPrice.toString() },
        });

        return product;
      });
    } catch (e) {
      mapUniqueError(e);
    }
  },

  // ---------------------------------------------------------------
  // STOCK ADJUSTMENT — the only manual path that changes quantity
  // ---------------------------------------------------------------
  async adjustStock(ctx: TenantContext, input: AdjustStockInput) {
    const product = await this.getById(ctx, input.id);
    if (product.quantity === input.newQuantity) {
      throw new ValidationError("New quantity is the same as the current quantity.");
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id: product.id },
        data: { quantity: input.newQuantity },
      });
      await tx.inventoryMovement.create({
        data: {
          businessId: ctx.businessId,
          productId: product.id,
          userId: ctx.user.id,
          type: "ADJUSTMENT",
          quantity: input.newQuantity - product.quantity, // signed delta
          quantityBefore: product.quantity,
          quantityAfter: input.newQuantity,
          reason: input.reason,
        },
      });
      await audit(tx, ctx, "product.adjust_stock", "Product", product.id, {
        from: product.quantity, to: input.newQuantity, reason: input.reason,
      });
      await syncLowStockAlert(tx, ctx, updated);
      return updated;
    });
  },

  // ---------------------------------------------------------------
  // SOFT DELETE / RESTORE / PERMANENT DELETE
  // ---------------------------------------------------------------
  async softDelete(ctx: TenantContext, ids: string[]) {
    // Verify every id belongs to this tenant BEFORE writing
    const owned = await prisma.product.findMany({
      where: { id: { in: ids }, businessId: ctx.businessId, deletedAt: null },
      select: { id: true },
    });
    if (owned.length === 0) throw new NotFoundError("Product");

    return prisma.$transaction(async (tx) => {
      await tx.product.updateMany({
        where: { id: { in: owned.map((p) => p.id) } },
        data: { deletedAt: new Date(), status: "INACTIVE" },
      });
      for (const p of owned) {
        await audit(tx, ctx, "product.delete", "Product", p.id);
      }
      return { count: owned.length };
    });
  },

  async restore(ctx: TenantContext, id: string) {
    const product = await prisma.product.findFirst({
      where: { id, businessId: ctx.businessId, deletedAt: { not: null } },
    });
    if (!product) throw new NotFoundError("Product");

    return prisma.$transaction(async (tx) => {
      const restored = await tx.product.update({
        where: { id }, data: { deletedAt: null, status: "ACTIVE" },
      });
      await audit(tx, ctx, "product.restore", "Product", id);
      return restored;
    });
  },

  /** Hard delete — super admin only (enforced in the action). Blocked by
      the DB (onDelete: Restrict) if the product has sales history. */
  async permanentDelete(ctx: TenantContext, id: string) {
    const product = await prisma.product.findFirst({
      where: { id, businessId: ctx.businessId },
      include: { _count: { select: { saleItems: true } } },
    });
    if (!product) throw new NotFoundError("Product");
    if (product._count.saleItems > 0) {
      throw new ConflictError("This product has sales history and can't be permanently deleted.");
    }

    return prisma.$transaction(async (tx) => {
      await tx.product.delete({ where: { id } }); // images cascade
      await audit(tx, ctx, "product.permanent_delete", "Product", id, { name: product.name });
      return { id };
    });
  },
};

/** Products where quantity > 0 AND quantity <= minimumStock (column-to-column). */
async function lowStockIds(businessId: string): Promise<string[]> {
  // Table names are @@map'ed to snake_case; column names stayed camelCase
  // in the Step 2 schema, so they must be quoted in raw SQL.
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM products
    WHERE "businessId" = ${businessId}::uuid
      AND "deletedAt" IS NULL
      AND quantity > 0
      AND quantity <= "minimumStock"
  `;
  return rows.map((r) => r.id);
}
