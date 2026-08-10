import { NextResponse } from "next/server";
import { isApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Shared response envelope for mobile-facing API routes (/api/products,
 * /api/sales, and onward) — HTTP-shaping only, no business logic (that
 * lives entirely in the relevant service). Not a new auth/error
 * architecture: it's a thin wrapper around the same isApiError()/ApiError
 * contract every other route in this app already uses.
 */

export interface ApiSuccess<T> {
  success: true;
  data: T;
  requestId: string;
}

export interface ApiFailure {
  success: false;
  error: { message: string; code: string; fieldErrors?: Record<string, string[]> };
  requestId: string;
}

export function newRequestId(): string {
  return crypto.randomUUID();
}

export function ok<T>(data: T, requestId: string, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ success: true, data, requestId }, { status });
}

/**
 * Converts any thrown error into a structured, safe response.
 * ApiError subclasses (thrown by services) carry their own status/message/
 * code and are safe to expose when `expose` is true. Anything else
 * (a raw Prisma error, a bug) is logged server-side with full detail and
 * never reaches the client beyond a generic message — same rule as
 * safeAction() and every other route's catch block in this codebase.
 */
export function fail(error: unknown, requestId: string, routeName: string): NextResponse<ApiFailure> {
  if (isApiError(error)) {
    const fieldErrors =
      "fieldErrors" in error
        ? (error as { fieldErrors?: Record<string, string[]> }).fieldErrors
        : undefined;

    return NextResponse.json(
      {
        success: false,
        error: {
          message: error.expose ? error.message : "Something went wrong.",
          code: error.code,
          ...(fieldErrors ? { fieldErrors } : {}),
        },
        requestId,
      },
      { status: error.statusCode }
    );
  }

  logger.error(`${routeName} failed`, {
    error: error instanceof Error ? error.message : "Unknown error",
    requestId,
  });

  return NextResponse.json(
    { success: false, error: { message: "Something went wrong.", code: "INTERNAL_ERROR" }, requestId },
    { status: 500 }
  );
}
