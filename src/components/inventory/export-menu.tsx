"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Export menu — plain <a> downloads hitting the route handler.
 * The route re-checks auth + role server-side; nothing sensitive
 * is decided on the client.
 */
export function ExportMenu() {
  const item = (label: string, type: string, format: string) => (
    <DropdownMenuItem asChild>
      <a href={`/api/inventory/export?type=${type}&format=${format}`} download>{label}</a>
    </DropdownMenuItem>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline"><Download className="size-4" aria-hidden /> Export</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Current stock</DropdownMenuLabel>
        {item("CSV", "stock", "csv")}
        {item("Excel (.xlsx)", "stock", "xlsx")}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Movements (last 5000)</DropdownMenuLabel>
        {item("CSV", "movements", "csv")}
        {item("Excel (.xlsx)", "movements", "xlsx")}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
