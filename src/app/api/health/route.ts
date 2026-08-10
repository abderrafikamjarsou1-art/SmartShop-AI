// =====================================================
// PHASE 4 — OBSERVABILITY
// =====================================================

// ---------- src/app/api/health/route.ts ----------
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/health — uptime monitors + deploy gates hit this.
 * Checks the things the app cannot live without: DB and required env.
 * Stripe is optional until billing/subscriptions are enabled.
 * Deliberately unauthenticated, deliberately cheap (SELECT 1).
 */
export async function GET() {
  const checks: Record<string, "ok" | "fail" | "optional"> = {};
  let healthy = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "fail";
    healthy = false;
  }

  for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "OPENAI_API_KEY"]) {
    checks[`env:${key}`] = process.env[key] ? "ok" : "fail";

    if (!process.env[key]) {
      healthy = false;
    }
  }

  // Stripe is optional until billing/subscriptions are enabled.
  checks["env:STRIPE_SECRET_KEY"] = process.env.STRIPE_SECRET_KEY
    ? "ok"
    : "optional";

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "degraded",
      checks,
      version:
        process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    },
    {
      status: healthy ? 200 : 503,
    }
  );
}