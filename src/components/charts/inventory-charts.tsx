"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Inventory value (at cost) over the last 6 months. */
export function InventoryTrendChart({ data }: { data: { month: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="fillInv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
        <Tooltip
          contentStyle={{
            borderRadius: 12, border: "1px solid var(--border)",
            background: "var(--popover)", color: "var(--popover-foreground)", fontSize: 13,
          }}
          cursor={{ stroke: "var(--border)" }}
        />
        <Area type="monotone" dataKey="value" name="Stock value" stroke="var(--chart-1)" strokeWidth={2} fill="url(#fillInv)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
