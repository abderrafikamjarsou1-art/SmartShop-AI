import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { forgotPasswordSchema } from "@/lib/validation";
import { assertRateLimit, getClientIp, rejectForgedOrigin, TooManyRequestsError } from "@/lib/rate-limit";
import { isApiError } from "@/lib/errors";

/**
 * POST /api/auth/forgot-password
 *
 * Mobile equivalent of the web `forgotPassword` Server Action
 * (src/actions/auth.ts) — same Supabase resetPasswordForEmail() call,
 * same rate limit, same "always report success" anti-enumeration
 * behavior, just JSON in/out instead of a form. The reset link itself
 * still completes on web (redirectTo points at /auth/confirm ->
 * /reset-password) — there is no native in-app reset screen, and none
 * is needed: the emailed link opens fine in the phone's browser.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

export async function POST(request: Request) {
  try {
    rejectForgedOrigin(request);
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ message: "الطلب مرفوض." }, { status: error.statusCode });
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "الطلب غير صالح." }, { status: 400 });
  }

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "البيانات المدخلة غير صحيحة.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const ip = getClientIp(request.headers);
    assertRateLimit(`forgot-password:${ip}:${parsed.data.email}`, 5, 60_000);

    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: APP_URL ? `${APP_URL}/auth/confirm?next=/reset-password` : undefined,
    });

    // Always report success — never reveal whether the email exists.
    return NextResponse.json({ sent: true }, { status: 200 });
  } catch (error) {
    if (error instanceof TooManyRequestsError) {
      return NextResponse.json({ message: "محاولات كثيرة جدًا. حاول مرة أخرى بعد دقيقة." }, { status: error.statusCode });
    }

    return NextResponse.json({ message: "حدث خطأ غير متوقع." }, { status: 500 });
  }
}
