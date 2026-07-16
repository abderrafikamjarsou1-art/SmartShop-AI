import "server-only";
import { isApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Standard result type returned by every Server Action.
 * Client components can rely on this exact shape with useActionState.
 */
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; code: string; fieldErrors?: Record<string, string[]> };

/**
 * Wraps a Server Action body with uniform error handling:
 *  - ApiError subclasses -> typed, user-safe error responses
 *  - Unknown errors      -> logged with context, generic message to client
 *    (never leak stack traces, Prisma errors or SQL to the browser)
 */
export async function safeAction<T>(
  actionName: string,
  fn: () => Promise<T>
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    if (isApiError(error)) {
      return {
        success: false,
        error: error.expose ? error.message : "Something went wrong.",
        code: error.code,
        fieldErrors: "fieldErrors" in error
          ? (error as { fieldErrors?: Record<string, string[]> }).fieldErrors
          : undefined,
      };
    }

    logger.error(`Unhandled error in action: ${actionName}`, { error });
    return { success: false, error: "Something went wrong. Please try again.", code: "INTERNAL_ERROR" };
  }
}
