import { describe, it, expect } from "vitest";
import {
  createProductSchema, adjustStockSchema, productFilterSchema,
} from "@/lib/validation/product";

const valid = {
  name: "USB-C cable",
  sku: "CBL-1",
  barcode: "611000111",
  buyingPrice: 10,
  sellingPrice: 25,
  quantity: 5,
  minimumStock: 2,
  status: "ACTIVE",
  allowLoss: false,
  images: [],
};

describe("createProductSchema", () => {
  it("accepts a valid product", () => {
    expect(createProductSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects empty name", () => {
    const r = createProductSchema.safeParse({ ...valid, name: "  " });
    expect(r.success).toBe(false);
  });

  // RULE: buying price cannot exceed selling price unless allowLoss
  it("rejects selling below cost when allowLoss is false", () => {
    const r = createProductSchema.safeParse({ ...valid, buyingPrice: 30, sellingPrice: 25 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path).toContain("sellingPrice");
    }
  });

  it("accepts selling below cost when allowLoss is true", () => {
    const r = createProductSchema.safeParse({ ...valid, buyingPrice: 30, sellingPrice: 25, allowLoss: true });
    expect(r.success).toBe(true);
  });

  // RULE: quantity and minimumStock cannot be negative
  it("rejects negative quantity", () => {
    expect(createProductSchema.safeParse({ ...valid, quantity: -1 }).success).toBe(false);
  });
  it("rejects negative minimum stock", () => {
    expect(createProductSchema.safeParse({ ...valid, minimumStock: -5 }).success).toBe(false);
  });

  it("rejects negative prices", () => {
    expect(createProductSchema.safeParse({ ...valid, buyingPrice: -1 }).success).toBe(false);
  });

  it("rejects more than 5 images", () => {
    const images = Array.from({ length: 6 }, (_, i) => ({ url: `https://x.com/${i}.webp`, path: `${i}.webp` }));
    expect(createProductSchema.safeParse({ ...valid, images }).success).toBe(false);
  });

  it("coerces numeric strings from form inputs", () => {
    const r = createProductSchema.safeParse({ ...valid, buyingPrice: "10.50", sellingPrice: "25", quantity: "3" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.buyingPrice).toBe(10.5);
      expect(r.data.quantity).toBe(3);
    }
  });

  it("transforms empty-string category to undefined", () => {
    const r = createProductSchema.safeParse({ ...valid, categoryId: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.categoryId).toBeUndefined();
  });
});

describe("adjustStockSchema", () => {
  it("requires a reason", () => {
    const r = adjustStockSchema.safeParse({ id: crypto.randomUUID(), newQuantity: 5, reason: "" });
    expect(r.success).toBe(false);
  });
  it("rejects negative quantity", () => {
    const r = adjustStockSchema.safeParse({ id: crypto.randomUUID(), newQuantity: -2, reason: "count" });
    expect(r.success).toBe(false);
  });
});

describe("productFilterSchema", () => {
  it("applies safe defaults for an empty query", () => {
    const r = productFilterSchema.parse({});
    expect(r).toMatchObject({ page: 1, perPage: 20, stock: "all", deleted: false, sortBy: "createdAt", sortDir: "desc" });
  });

  it("caps perPage at 100", () => {
    expect(() => productFilterSchema.parse({ perPage: "500" })).toThrow();
  });

  it("rejects unknown sort fields (whitelist, not blacklist)", () => {
    expect(() => productFilterSchema.parse({ sortBy: "id; DROP TABLE" })).toThrow();
  });
});
