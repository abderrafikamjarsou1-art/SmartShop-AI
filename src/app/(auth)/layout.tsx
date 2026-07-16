import Link from "next/link";
import { Store } from "lucide-react";

/**
 * Auth layout — centered card on the soft canvas, brand on top.
 * Used by /login, /register, /forgot-password, /reset-password.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2 font-semibold display-tight">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Store className="size-4.5" aria-hidden />
        </span>
        SmartShop AI
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
