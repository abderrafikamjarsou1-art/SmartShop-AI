import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { zEmail, zPassword, zRequiredString } from "@/lib/validation";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { assertRateLimit, getClientIp, rejectForgedOrigin, TooManyRequestsError } from "@/lib/rate-limit";
import { isApiError } from "@/lib/errors";

/**
 * POST /api/auth/register
 *
 * Mobile equivalent of the web `register` Server Action (src/actions/auth.ts)
 * — same Supabase signUp() call, same validation rules, just JSON in/out
 * instead of a form. Intentionally does NOT touch passwordHash/bcrypt:
 * Supabase Auth owns password storage; that column is unused legacy state.
 */

const registerBodySchema = z.object({
  fullName: zRequiredString("Full name", 100),
  email: zEmail,
  password: zPassword,
});

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

  const parsed = registerBodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "البيانات المدخلة غير صحيحة.",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 400 }
    );
  }

  const { fullName, email, password } = parsed.data;

  try {
    const ip = getClientIp(request.headers);
    assertRateLimit(`register:${ip}`, 5, 15 * 60_000);

    const supabase = await createClient();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: APP_URL ? `${APP_URL}/auth/confirm` : undefined,
      },
    });

    if (error) {
      const duplicate = /already registered|already exists|already in use/i.test(error.message);
      return NextResponse.json(
        { message: duplicate ? "البريد الإلكتروني مستخدم بالفعل." : "تعذر إنشاء الحساب. تحقق من البيانات وحاول مرة أخرى." },
        { status: duplicate ? 409 : 400 }
      );
    }

    if (!data.user) {
      return NextResponse.json(
        { message: "تعذر إنشاء الحساب." },
        { status: 500 }
      );
    }

    // Supabase quirk: re-signing up an already-registered (confirmed) email
    // returns success with no error but an empty `identities` array — the
    // only reliable signal that this is actually a duplicate, not a new user.
    if (data.user.identities && data.user.identities.length === 0) {
      return NextResponse.json(
        { message: "البريد الإلكتروني مستخدم بالفعل." },
        { status: 409 }
      );
    }

    const user = await prisma.user.upsert({
      where: { id: data.user.id },
      update: {
        email: data.user.email ?? email,
        fullName,
      },
      create: {
        id: data.user.id,
        email: data.user.email ?? email,
        fullName,
      },
    });

    logger.info("User registered (mobile)", { email });

    const needsVerification = !data.session;

    return NextResponse.json(
      {
        message: needsVerification
          ? "تم إنشاء الحساب. يرجى تأكيد بريدك الإلكتروني قبل تسجيل الدخول."
          : "تم إنشاء الحساب بنجاح.",
        needsVerification,
        token: data.session?.access_token ?? null,
        refreshToken: data.session?.refresh_token ?? null,
        expiresAt: data.session?.expires_at ?? null,
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          avatarUrl: user.avatarUrl,
          isSuperAdmin: user.isSuperAdmin,
          role: null,
          businessId: null,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof TooManyRequestsError) {
      return NextResponse.json({ message: "محاولات كثيرة جدًا. حاول مرة أخرى لاحقًا." }, { status: err.statusCode });
    }

    logger.error("Register API error", {
      error: err instanceof Error ? err.message : "Unknown error",
    });

    return NextResponse.json(
      { message: "حدث خطأ أثناء إنشاء الحساب." },
      { status: 500 }
    );
  }
}
