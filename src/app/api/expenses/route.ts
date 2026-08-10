import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/tenant";
import { zParse } from "@/lib/validation";
import { expenseSchema, expenseFilterSchema } from "@/lib/validation/expense";
import { expenseService } from "@/services/expense-service";
import { assertSameOrigin } from "@/lib/rate-limit";
import { extractBearerToken } from "@/lib/auth-bearer";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * GET  /api/expenses — paginated, filtered, searched list (also returns
 *      sumAmount/sumTax for the current filter). "recurring" flag switches
 *      between the templates view and the dated-instances view.
 * POST /api/expenses — create. Same pipeline as every other route:
 *      requireRole -> Zod -> expenseService. "expenses:manage" is the
 *      only expense permission (no separate "view").
 */

export async function GET(request: NextRequest) {
  const requestId = newRequestId();
  try {
    const ctx = await requireRole("expenses:manage");
    const filter = zParse(expenseFilterSchema, Object.fromEntries(request.nextUrl.searchParams));
    const result = await expenseService.list(ctx, filter);
    return ok(result, requestId);
  } catch (error) {
    return fail(error, requestId, "GET /api/expenses");
  }
}

export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  try {
    if (!extractBearerToken(request.headers.get("authorization"))) {
      assertSameOrigin(request);
    }

    const ctx = await requireRole("expenses:manage");
    const body = await request.json().catch(() => ({}));
    const input = zParse(expenseSchema, body);
    const expense = await expenseService.create(ctx, input);
    return ok(expense, requestId, 201);
  } catch (error) {
    return fail(error, requestId, "POST /api/expenses");
  }
}
