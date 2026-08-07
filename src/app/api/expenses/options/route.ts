import { requireRole } from "@/lib/tenant";
import { expenseService } from "@/services/expense-service";
import { ok, fail, newRequestId } from "@/lib/api-response";

/**
 * GET /api/expenses/options — suppliers (vendors) for the create-form
 * picker. Reuses expenseService.getFormOptions().
 */
export async function GET() {
  const requestId = newRequestId();
  try {
    const ctx = await requireRole("expenses:manage");
    const options = await expenseService.getFormOptions(ctx);
    return ok(options, requestId);
  } catch (error) {
    return fail(error, requestId, "GET /api/expenses/options");
  }
}
