import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/tenant";
import { zParse, zUuid } from "@/lib/validation";
import { updateExpenseSchema } from "@/lib/validation/expense";
import { expenseService } from "@/services/expense-service";
import { assertSameOrigin } from "@/lib/rate-limit";
import { extractBearerToken } from "@/lib/auth-bearer";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * GET    /api/expenses/[id] — single expense (or template).
 * PATCH  /api/expenses/[id] — update. URL id is authoritative — a
 *        client-supplied body id is always overridden.
 * DELETE /api/expenses/[id] — soft delete.
 */

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    const ctx = await requireRole("expenses:manage");
    const { id } = await params;
    const expense = await expenseService.getById(ctx, zParse(zUuid, id));
    return ok(expense, requestId);
  } catch (error) {
    return fail(error, requestId, "GET /api/expenses/[id]");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    if (!extractBearerToken(request.headers.get("authorization"))) {
      assertSameOrigin(request);
    }

    const ctx = await requireRole("expenses:manage");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const input = zParse(updateExpenseSchema, { ...body, id });
    const expense = await expenseService.update(ctx, id, input);
    return ok(expense, requestId);
  } catch (error) {
    return fail(error, requestId, "PATCH /api/expenses/[id]");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    if (!extractBearerToken(request.headers.get("authorization"))) {
      assertSameOrigin(request);
    }

    const ctx = await requireRole("expenses:manage");
    const { id } = await params;
    const result = await expenseService.softDelete(ctx, zParse(zUuid, id));
    return ok(result, requestId);
  } catch (error) {
    return fail(error, requestId, "DELETE /api/expenses/[id]");
  }
}
