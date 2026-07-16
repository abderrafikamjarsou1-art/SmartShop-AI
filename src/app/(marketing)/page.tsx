import Link from "next/link";
import { ArrowRight, BarChart3, Bot, Boxes, Receipt, ScanLine, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "SmartShop AI — Modern shop management",
  description:
    "Point of sale, inventory, purchasing, customers, reports and an AI copilot — one fast, multi-tenant platform for modern retail.",
};

const FEATURES = [
  { icon: ScanLine, title: "Point of sale", body: "Barcode-fast checkout with PDF invoices and multi-tender payments." },
  { icon: Boxes, title: "Inventory", body: "Real-time stock, low-stock alerts, and a full movement ledger." },
  { icon: Receipt, title: "Purchases & expenses", body: "Track suppliers, receive stock at cost, and categorize every dirham." },
  { icon: Users, title: "Customers & credit", body: "Balances, store credit, and FIFO payment allocation built in." },
  { icon: BarChart3, title: "Reports", body: "Executive, sales, inventory and financial dashboards from real snapshots." },
  { icon: Bot, title: "AI copilot", body: "Ask about your business in plain language — grounded in your own data." },
];

export default function LandingPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28">
        <span className="inline-flex rounded-full border px-3 py-1 text-xs text-muted-foreground">
          Built for modern retail
        </span>
        <h1 className="mt-5 text-balance display-tight text-4xl font-bold sm:text-5xl">
          Run your whole shop from one clean dashboard.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-lg text-muted-foreground">
          SmartShop AI brings point of sale, inventory, purchasing, customers, reports and an AI
          copilot together — fast, multi-tenant, and ready for your team.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/register">
              Start free <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/pricing">See pricing</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-5 shadow-soft">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="size-4.5" aria-hidden />
              </span>
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
