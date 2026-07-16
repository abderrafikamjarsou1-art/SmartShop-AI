import Link from "next/link";
import { Store } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Public/marketing layout — glass navbar + minimal footer.
 * Wraps the landing (/) and pricing (/pricing) pages.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="glass sticky top-0 z-40 border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold display-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Store className="size-4" aria-hidden />
            </span>
            SmartShop AI
          </Link>
          <nav aria-label="Marketing" className="flex items-center gap-1">
            <Button variant="ghost" asChild><Link href="/pricing">Pricing</Link></Button>
            <Button variant="ghost" asChild><Link href="/login">Sign in</Link></Button>
            <Button asChild><Link href="/register">Get started</Link></Button>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t py-8">
        <p className="text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} SmartShop AI
        </p>
      </footer>
    </div>
  );
}
