import Link from "next/link";
import { ArrowRight, CreditCard, User } from "lucide-react";
import { requireBusiness } from "@/lib/tenant";
import { PageHeader } from "@/components/shared/page-primitives";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Settings" };

const ITEMS = [
  { href: "/settings/profile", icon: User, title: "Profile", body: "Your name, email and role." },
  { href: "/settings/billing", icon: CreditCard, title: "Billing & plan", body: "Subscription, invoices and usage." },
];

export default async function SettingsPage() {
  const ctx = await requireBusiness();

  return (
    <>
      <PageHeader title="Settings" description={ctx.business.name} />
      <div className="grid gap-4 sm:grid-cols-2">
        {ITEMS.map((it) => (
          <Link key={it.href} href={it.href} className="group">
            <Card className="shadow-soft transition-colors group-hover:border-primary/40">
              <CardContent className="flex items-center gap-4 p-5">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <it.icon className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{it.title}</p>
                  <p className="text-sm text-muted-foreground">{it.body}</p>
                </div>
                <ArrowRight
                  className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
