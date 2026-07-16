import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * Admin layout — its own shell, deliberately visually distinct from the
 * tenant app (no sidebar, warning-tinted header) so an admin always
 * knows they're operating at platform level. requireSuperAdmin() throws
 * for non-admins even if they guess the URL.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();

  return (
    <div className="min-h-dvh">
      <header className="glass sticky top-0 z-40 border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-warning/15 text-warning">
              <ShieldCheck className="size-4" aria-hidden />
            </span>
            <span className="font-semibold display-tight">Platform Admin</span>
            <Badge variant="outline" className="border-warning/40 text-warning">Super admin</Badge>
          </div>
          <Button variant="ghost" asChild>
            <Link href="/dashboard"><ArrowLeft className="size-4" aria-hidden /> Back to app</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
