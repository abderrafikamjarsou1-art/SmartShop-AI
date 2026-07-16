"use client";

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

/**
 * Charts — Client Components, imported with next/dynamic (ssr: false)
 * so Recharts (~100kb) never blocks first paint and never renders on
 * the server. Colors come from CSS variables -> automatic dark mode.
 */

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  fontSize: 13,
  boxShadow: "0 8px 24px rgb(0 0 0 / 0.08)",
};

export function RevenueChart({ data }: { data: { month: string; revenue: number; profit: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="fillProfit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.2} />
            <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "var(--border)" }} />
        <Area type="monotone" dataKey="revenue" name="Revenue" stroke="var(--chart-1)" strokeWidth={2} fill="url(#fillRevenue)" />
        <Area type="monotone" dataKey="profit" name="Profit" stroke="var(--chart-2)" strokeWidth={2} fill="url(#fillProfit)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function WeeklySalesChart({ data }: { data: { day: string; sales: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--secondary)" }} />
        <Bar dataKey="sales" name="Sales" fill="var(--chart-1)" radius={[6, 6, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}
