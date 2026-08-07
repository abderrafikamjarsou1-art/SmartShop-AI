import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/require-api-auth";
import { isApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * GET /api/auth/me
 *
 * Works for both transports:
 *  - Mobile: `Authorization: Bearer <supabase_access_token>`
 *  - Web:    existing Supabase session cookie
 * (see lib/auth.ts getCurrentUser() for how the transport is picked)
 */
export async function GET() {
  try {
    const ctx = await requireApiAuth();

    return NextResponse.json(
      {
        user: {
          id: ctx.userId,
          fullName: ctx.fullName,
          email: ctx.email,
          avatarUrl: ctx.avatarUrl,
          isSuperAdmin: ctx.isSuperAdmin,
          role: ctx.role,
          businessId: ctx.businessId,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    logger.error("GET /api/auth/me failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json({ message: "An error occurred." }, { status: 500 });
  }
}
