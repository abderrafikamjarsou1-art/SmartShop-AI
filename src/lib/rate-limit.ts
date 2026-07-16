// =====================================================
// fixes/rate-limit.ts  ->  src/lib/rate-limit.ts
// =====================================================
import { ApiError } from "@/lib/errors";

/**
 * Fixed-window rate limiter, in-memory.
 * SCOPE NOTE (documented, deliberate): per-serverless-instance. That
 * still stops naive brute force (one attacker mostly hits one warm
 * instance) at zero infra cost. When horizontal scale demands global
 * limits, replace `hits` with Upstash Redis INCR/EXPIRE — the call
 * sites don't change.
 *
 * Usage in auth actions:
 *   assertRateLimit(`login:${ip}:${email}`, 10, 60_000);
 */
export class TooManyRequestsError extends ApiError {
  constructor() { super("Too many attempts. Try again in a minute.", 429, "RATE_LIMITED", true); }
}

const hits = new Map<string, { count: number; resetAt: number }>();

export function assertRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  entry.count++;
  if (entry.count > limit) throw new TooManyRequestsError();
}

// Housekeeping: prevent unbounded growth on long-lived instances
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
}, 60_000).unref?.();

// =====================================================
// fixes/origin-check  ->  src/lib/origin-check.ts
// =====================================================

/**
 * CSRF defense for cookie-authed MUTATING route handlers (Server Actions
 * already have this built in; route handlers don't).
 * Apply at the top of POST/PUT/DELETE handlers:
 *   assertSameOrigin(request);
 */
export function assertSameOrigin(request: Request) {
  const appOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL!).origin;
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  const ok =
    (origin && origin === appOrigin) ||
    (!origin && referer && new URL(referer).origin === appOrigin);

  if (!ok) throw new ApiError("Cross-origin request rejected.", 403, "BAD_ORIGIN", true);
}

// APPLY TO: src/app/api/ai/chat/route.ts (POST) — first line inside try{}.
// GET handlers and the Stripe webhook (signature-authed) do NOT need it.
