/**
 * Report periods — PURE date logic (no IO), fully unit-testable.
 *
 * A "period" resolves to:
 *  - range:      [from, to)   half-open — `to` is EXCLUSIVE. This is the
 *                convention that kills off-by-one-day bugs: the next
 *                period's `from` equals this period's `to`, always.
 *  - previous:   the immediately preceding range of equal length,
 *                used for delta badges ("+12% vs last period")
 *  - bucket:     chart granularity (day/week/month) chosen so charts
 *                have a readable number of points at any range size
 */

export type PeriodPreset = "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "custom";
export type Bucket = "day" | "week" | "month";

export interface ResolvedPeriod {
  from: Date;
  to: Date;         // EXCLUSIVE
  prevFrom: Date;
  prevTo: Date;     // EXCLUSIVE
  bucket: Bucket;
  label: string;
}

const DAY = 86_400_000;

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number) { return new Date(d.getTime() + n * DAY); }

export function resolvePeriod(
  preset: PeriodPreset,
  now: Date = new Date(),
  custom?: { from: Date; to: Date }
): ResolvedPeriod {
  const today = startOfDay(now);

  switch (preset) {
    case "daily": {
      const from = today, to = addDays(today, 1);
      return { from, to, prevFrom: addDays(from, -1), prevTo: from, bucket: "day", label: "Today" };
    }
    case "weekly": {
      // ISO week: Monday start
      const dow = (today.getDay() + 6) % 7;
      const from = addDays(today, -dow), to = addDays(from, 7);
      return { from, to, prevFrom: addDays(from, -7), prevTo: from, bucket: "day", label: "This week" };
    }
    case "monthly": {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      const to = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      const prevFrom = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      return { from, to, prevFrom, prevTo: from, bucket: "day", label: "This month" };
    }
    case "quarterly": {
      const q = Math.floor(today.getMonth() / 3);
      const from = new Date(today.getFullYear(), q * 3, 1);
      const to = new Date(today.getFullYear(), q * 3 + 3, 1);
      const prevFrom = new Date(today.getFullYear(), q * 3 - 3, 1);
      return { from, to, prevFrom, prevTo: from, bucket: "week", label: `Q${q + 1} ${today.getFullYear()}` };
    }
    case "yearly": {
      const from = new Date(today.getFullYear(), 0, 1);
      const to = new Date(today.getFullYear() + 1, 0, 1);
      const prevFrom = new Date(today.getFullYear() - 1, 0, 1);
      return { from, to, prevFrom, prevTo: from, bucket: "month", label: String(today.getFullYear()) };
    }
    case "custom": {
      if (!custom) throw new Error("Custom period requires from/to.");
      const from = startOfDay(custom.from);
      const to = addDays(startOfDay(custom.to), 1); // inclusive input -> exclusive bound
      const span = to.getTime() - from.getTime();
      return {
        from, to,
        prevFrom: new Date(from.getTime() - span), prevTo: from,
        bucket: pickBucket(span / DAY),
        label: `${from.toLocaleDateString()} – ${custom.to.toLocaleDateString()}`,
      };
    }
  }
}

/** <= 31 days -> daily points; <= 120 -> weekly; else monthly. */
export function pickBucket(days: number): Bucket {
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  return "month";
}

/** Percentage delta with safe zero handling (null = "no basis"). */
export function delta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}
