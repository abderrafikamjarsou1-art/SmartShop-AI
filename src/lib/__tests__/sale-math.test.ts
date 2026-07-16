import { describe, it, expect } from "vitest";
import { computeTotals, computeRefund, derivePaymentStatus, computeChange, round2 } from "@/lib/sale-math";

describe("computeTotals", () => {
  it("computes a simple cart", () => {
    const t = computeTotals([{ quantity: 2, unitPrice: 100, discountAmount: 0 }], 0, 20);
    expect(t).toMatchObject({ subtotal: 200, taxableBase: 200, taxAmount: 40, total: 240 });
  });

  it("applies line and global discounts before tax", () => {
    const t = computeTotals(
      [
        { quantity: 2, unitPrice: 100, discountAmount: 20 }, // 180
        { quantity: 1, unitPrice: 50, discountAmount: 0 },   // 50
      ],
      30, 10
    );
    expect(t.subtotal).toBe(230);
    expect(t.taxableBase).toBe(200);
    expect(t.taxAmount).toBe(20);
    expect(t.total).toBe(220);
  });

  it("clamps global discount to the subtotal (total never negative)", () => {
    const t = computeTotals([{ quantity: 1, unitPrice: 50, discountAmount: 0 }], 999, 20);
    expect(t.globalDiscount).toBe(50);
    expect(t.total).toBe(0);
  });

  it("a line discount can't push a line negative", () => {
    const t = computeTotals([{ quantity: 1, unitPrice: 10, discountAmount: 25 }], 0, 0);
    expect(t.subtotal).toBe(0);
  });

  it("rounds like a cash register (2dp at each boundary)", () => {
    const t = computeTotals([{ quantity: 3, unitPrice: 9.99, discountAmount: 0 }], 0, 19.6);
    expect(t.subtotal).toBe(29.97);
    expect(t.taxAmount).toBe(round2(29.97 * 0.196));
    expect(t.total).toBe(round2(29.97 + t.taxAmount));
  });
});

describe("computeRefund", () => {
  // Sale: line 200 (2x100), line 100 -> subtotal 300, global -30, tax 10% -> total 297
  const subtotal = 300, total = 297;

  it("refunds one unit at the effective paid rate", () => {
    // line total 200, qty 2 -> per-unit base 100, effective ratio 297/300 = 0.99
    expect(computeRefund(200, 2, 1, subtotal, total)).toBe(99);
  });

  it("full return refunds exactly the total", () => {
    const r1 = computeRefund(200, 2, 2, subtotal, total);
    const r2 = computeRefund(100, 1, 1, subtotal, total);
    expect(round2(r1 + r2)).toBe(total);
  });

  it("handles zero-subtotal sales safely", () => {
    expect(computeRefund(0, 1, 1, 0, 0)).toBe(0);
  });
});

describe("derivePaymentStatus", () => {
  it("maps amounts to statuses", () => {
    expect(derivePaymentStatus(0, 100)).toBe("PENDING");
    expect(derivePaymentStatus(40, 100)).toBe("PARTIAL");
    expect(derivePaymentStatus(100, 100)).toBe("PAID");
    expect(derivePaymentStatus(100.004, 100)).toBe("PAID"); // rounding tolerance
  });
});

describe("computeChange", () => {
  it("returns change only from cash", () => {
    expect(computeChange([{ method: "CASH", amount: 250 }], 240)).toBe(10);
    expect(computeChange([{ method: "CARD", amount: 250 }], 240)).toBe(0); // cards don't give change
  });
  it("mixed payment: change limited to the cash portion", () => {
    expect(computeChange([{ method: "CARD", amount: 235 }, { method: "CASH", amount: 10 }], 240)).toBe(5);
  });
});
