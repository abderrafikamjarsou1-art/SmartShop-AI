import { describe, it, expect } from "vitest";
import { parseCsv, toCsv, csvToObjects } from "@/lib/csv";
import { importRowSchema } from "@/lib/validation/inventory";

describe("parseCsv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("handles CRLF and trailing newline", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("handles quoted fields with commas and newlines", () => {
    expect(parseCsv('sku,"reason"\nA1,"damaged, 2 units\nsee note"')).toEqual([
      ["sku", "reason"],
      ["A1", "damaged, 2 units\nsee note"],
    ]);
  });

  it("handles escaped quotes", () => {
    expect(parseCsv('a\n"he said ""hi"""')).toEqual([["a"], ['he said "hi"']]);
  });

  it("strips BOM (Excel exports)", () => {
    expect(parseCsv("\uFEFFsku\nA1")).toEqual([["sku"], ["A1"]]);
  });

  it("drops blank lines", () => {
    expect(parseCsv("a,b\n\n1,2\n\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("toCsv", () => {
  it("round-trips through parseCsv", () => {
    const rows = [{ sku: "A,1", reason: 'said "ok"', qty: 5 }];
    const csv = toCsv(rows);
    expect(parseCsv(csv)).toEqual([["sku", "reason", "qty"], ['A,1', 'said "ok"', "5"]]);
  });

  it("returns empty string for no rows", () => {
    expect(toCsv([])).toBe("");
  });
});

describe("csvToObjects", () => {
  it("keys rows by lowercased headers", () => {
    const { headers, objects } = csvToObjects("SKU,NewQuantity\nA1, 5 ");
    expect(headers).toEqual(["sku", "newquantity"]);
    expect(objects).toEqual([{ sku: "A1", newquantity: "5" }]);
  });
});

describe("importRowSchema (CSV row validation)", () => {
  it("coerces string quantities", () => {
    const r = importRowSchema.safeParse({ sku: "A1", newQuantity: "12" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.newQuantity).toBe(12);
  });

  it("rejects negative and non-numeric quantities", () => {
    expect(importRowSchema.safeParse({ sku: "A1", newQuantity: "-3" }).success).toBe(false);
    expect(importRowSchema.safeParse({ sku: "A1", newQuantity: "abc" }).success).toBe(false);
  });

  it("defaults the reason", () => {
    const r = importRowSchema.safeParse({ sku: "A1", newQuantity: 1 });
    if (r.success) expect(r.data.reason).toBe("Bulk adjustment");
  });
});
