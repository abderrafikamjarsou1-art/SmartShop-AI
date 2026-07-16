"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Section navigation for /inventory (Overview | Movements).
 * Plain links — server components re-render per route, tab state = URL.
 */
export function InventoryTabs() {
  const pathname = usePathname();
  const tabs = [
    { href: "/inventory", label: "Overview" },
    { href: "/inventory/movements", label: "Movements" },
  ];

  return (
    <nav aria-label="Inventory sections" className="mb-6 flex gap-1 rounded-lg bg-secondary p-1 w-fit">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors
              ${active ? "bg-background shadow-soft" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
