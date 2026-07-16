"use client";

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const tooltipStyle = {
  borderRadius: 12, border: "1px solid var(--border)",
  background: "var(--popover)", color: "var(--popover-foreground)",
  fontSize: 13, boxShadow: "0 8px 24px rgb(0 0 0 / 0.08)",
};

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

function fmtBucket(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function TrendChart({ data, series, labels = {} }: {
  data: { bucket: string; revenue: number; profit: number; expenses: number }[];
  series: ("revenue" | "profit" | "expenses")[];
  labels?: Partial<Record<string, string>>;
}) {
  const names = { revenue: labels.revenue ?? "Revenue", profit: labels.profit ?? "Profit", expenses: labels.expenses ?? "Expenses" };
  const colors = { revenue: "var(--chart-1)", profit: "var(--chart-2)", expenses: "var(--chart-3)" };

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s} id={`fill-${s}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors[s]} stopOpacity={0.2} />
              <stop offset="100%" stopColor={colors[s]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="bucket" tickFormatter={fmtBucket} tickLine={false} axisLine={false}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtBucket} cursor={{ stroke: "var(--border)" }} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s) => (
          <Area key={s} type="monotone" dataKey={s} name={names[s]}
            stroke={colors[s]} strokeWidth={2} fill={`url(#fill-${s})`} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function PaymentPie({ data }: { data: { name: string; value: number }[] }) {
  if (data.length === 0) {
    return <p className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">No payments in this period.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={64} outerRadius={100} paddingAngle={3} strokeWidth={0}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => v.toFixed(2)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function GrowthChart({ data }: { data: { bucket: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="bucket" tickFormatter={fmtBucket} tickLine={false} axisLine={false}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtBucket} cursor={{ fill: "var(--secondary)" }} />
        <Bar dataKey="value" name="New customers" fill="var(--chart-1)" radius={[6, 6, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ResponsiveContainer>
  );
}
