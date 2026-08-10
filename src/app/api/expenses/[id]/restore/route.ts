import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/tenant";
import { zParse, zUuid } from "@/lib/validation";
import { expenseService } from "@/services/expense-service";
import { assertSameOrigin } from "@/lib/rate-limit";
import { extractBearerToken } from "@/lib/auth-bearer";
import { ok, fail, newRequestId } from "@/lib/api-response";

/** POST /api/expenses/[id]/restore — undo a soft delete. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  try {
    if (!extractBearerToken(request.headers.get("authorization"))) {
      assertSameOrigin(request);
    }

    const ctx = await requireRole("expenses:manage");
    const { id } = await params;
    const expense = await expenseService.restore(ctx, zParse(zUuid, id));
    return ok(expense, requestId);
  } catch (error) {
    return fail(error, requestId, "POST /api/expenses/[id]/restore");
  }
}
