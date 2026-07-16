"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface ChartSpec {
  type: "bar" | "line";
  title?: string;
  data: { label: string; value: number }[];
}

function parseSpec(raw: string): ChartSpec | null {
  try {
    const spec: unknown = JSON.parse(raw);

    if (!spec || typeof spec !== "object") return null;

    const s = spec as {
      type?: unknown;
      title?: unknown;
      data?: unknown;
    };

    if (s.type !== "bar" && s.type !== "line") return null;

    if (!Array.isArray(s.data) || s.data.length === 0 || s.data.length > 50)
      return null;

    const data = s.data
      .filter(
        (d: unknown): d is { label: unknown; value: unknown } =>
          !!d && typeof d === "object"
      )
      .map((d) => ({
        label: String(d.label).slice(0, 30),
        value: Number(d.value),
      }))
      .filter((d) => Number.isFinite(d.value));

    if (data.length === 0) return null;

    return {
      type: s.type,
      title:
        typeof s.title === "string" ? s.title.slice(0, 80) : undefined,
      data,
    };
  } catch {
    return null;
  }
}

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  fontSize: 12,
};

export function AiChartInner({ spec: raw }: { spec: string }) {
  const spec = parseSpec(raw);

  if (!spec) return null;

  return (
    <div className="rounded-xl border bg-card p-3">
      {spec.title && (
        <p className="mb-2 text-sm font-medium">{spec.title}</p>
      )}

      <ResponsiveContainer width="100%" height={220}>
        {spec.type === "bar" ? (
          <BarChart data={spec.data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} />
          </BarChart>
        ) : (
          <LineChart data={spec.data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip contentStyle={tooltipStyle} />
            <Line
              type="monotone"
              dataKey="value"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}