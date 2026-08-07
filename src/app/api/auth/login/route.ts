import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, getClientIp, rejectForgedOrigin } from "@/lib/rate-limit";
import { isApiError } from "@/lib/errors";

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

export async function POST(request: Request) {
  try {
    rejectForgedOrigin(request);

    const body = (await request.json()) as LoginBody;

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const ip = getClientIp(request.headers);
    assertRateLimit(`login:${ip}:${email}`, 10, 60_000);

    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    if (!email || !password) {
      return NextResponse.json(
        {
          message: "البريد الإلكتروني وكلمة المرور مطلوبان.",
        },
        { status: 400 }
      );
    }

    const emailPattern =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email)) {
      return NextResponse.json(
        {
          message: "صيغة البريد الإلكتروني غير صحيحة.",
        },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const {
      data,
      error,
    } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (
      error ||
      !data.user ||
      !data.session
    ) {
      return NextResponse.json(
        {
          message:
            "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
        },
        { status: 401 }
      );
    }

    const authUser = data.user;

    const user = await prisma.user.upsert({
      where: {
        id: authUser.id,
      },
      update: {
        email: authUser.email ?? email,
        fullName:
          authUser.user_metadata?.full_name ??
          undefined,
        avatarUrl:
          authUser.user_metadata?.avatar_url ??
          undefined,
      },
      create: {
        id: authUser.id,
        email: authUser.email ?? email,
        fullName:
          authUser.user_metadata?.full_name ??
          null,
        avatarUrl:
          authUser.user_metadata?.avatar_url ??
          null,
      },
      include: {
        memberships: {
          orderBy: {
            createdAt: "asc",
          },
          take: 1,
        },
      },
    });

    const membership =
      user.memberships[0] ?? null;

    return NextResponse.json(
      {
        message: "تم تسجيل الدخول بنجاح.",
        token: data.session.access_token,
        refreshToken:
          data.session.refresh_token,
        expiresAt:
          data.session.expires_at ?? null,
        user: {
          id: user.id,
          name:
            user.fullName ??
            authUser.user_metadata?.full_name ??
            email.split("@")[0],
          fullName: user.fullName,
          email: user.email,
          avatarUrl: user.avatarUrl,
          isSuperAdmin:
            user.isSuperAdmin,
          role:
            membership?.role ?? null,
          businessId:
            membership?.businessId ?? null,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (isApiError(error)) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    console.error(
      "Login API error:",
      error instanceof Error
        ? error.message
        : "Unknown error"
    );

    return NextResponse.json(
      {
        message:
          "حدث خطأ أثناء تسجيل الدخول.",
      },
      { status: 500 }
    );
  }
}