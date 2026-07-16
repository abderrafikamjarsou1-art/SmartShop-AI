import { round2 } from "@/lib/sale-math";

/**
 * Deterministic revenue forecasting — PURE math, zero LLM involvement.
 *
 * DESIGN DECISION (per "do not hallucinate"): the model NEVER invents
 * numbers. The getRevenueForecast tool runs ordinary least squares over
 * historical monthly net revenue and hands the model a finished result
 * with an explicit confidence level; the model's only job is to explain
 * it in words. Same input -> same forecast, forever.
 *
 * Confidence is derived from two honest signals:
 *  - R² of the fit (how much of the variance the trend explains)
 *  - sample size (fewer than 3 months = no forecast at all)
 */

export interface ForecastResult {
  ok: boolean;
  reason?: string;                  // when ok = false
  nextPeriod?: number;              // forecasted value
  trendPerPeriod?: number;          // slope
  r2?: number;
  confidence?: "high" | "medium" | "low";
  confidenceExplanation?: string;
  basedOnPeriods?: number;
}

export function linearForecast(series: number[]): ForecastResult {
  const n = series.length;
  if (n < 3) {
    return { ok: false, reason: `Only ${n} period(s) of history — at least 3 are needed for a trend.` };
  }

  // OLS on (x = 0..n-1, y = series)
  const xMean = (n - 1) / 2;
  const yMean = series.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, ssTot = 0;
  series.forEach((y, x) => {
    sxy += (x - xMean) * (y - yMean);
    sxx += (x - xMean) ** 2;
    ssTot += (y - yMean) ** 2;
  });
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = yMean - slope * xMean;

  let ssRes = 0;
  series.forEach((y, x) => { ssRes += (y - (intercept + slope * x)) ** 2; });
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  const forecast = Math.max(0, intercept + slope * n);

  const confidence: "high" | "medium" | "low" =
    r2 >= 0.7 && n >= 6 ? "high" : r2 >= 0.4 && n >= 4 ? "medium" : "low";

  return {
    ok: true,
    nextPeriod: round2(forecast),
    trendPerPeriod: round2(slope),
    r2: round2(r2),
    confidence,
    confidenceExplanation:
      `Linear trend over ${n} months explains ${Math.round(r2 * 100)}% of the variance (R²=${r2.toFixed(2)}). ` +
      (confidence === "low"
        ? "Treat this as a rough direction, not a number to plan on."
        : confidence === "medium"
          ? "Reasonable directional estimate; expect meaningful variation."
          : "Historical pattern is consistent; still not a guarantee."),
    basedOnPeriods: n,
  };
}

/**
 * Reorder math — also pure and deterministic.
 * velocity = units sold in the window / window days.
 * daysOfCover = stock / velocity. Recommend when cover < targetDays or
 * stock <= minimumStock. Suggested qty tops the product back up to
 * targetDays of cover (respecting minimumStock as a floor).
 */
export interface ReorderInput {
  name: string;
  quantity: number;
  minimumStock: number;
  soldInWindow: number;
  windowDays: number;
}

export interface ReorderRecommendation {
  name: string;
  currentStock: number;
  dailyVelocity: number;
  daysOfCover: number | null;       // null = no sales, cover is infinite
  reason: string;
  suggestedQuantity: number;
}

export function computeReorder(items: ReorderInput[], targetDays = 30): ReorderRecommendation[] {
  return items.flatMap((item) => {
    const velocity = item.soldInWindow / item.windowDays;
    const cover = velocity > 0 ? item.quantity / velocity : null;
    const belowMin = item.quantity <= item.minimumStock;
    const lowCover = cover !== null && cover < targetDays;
    if (!belowMin && !lowCover) return [];

    const target = Math.max(Math.ceil(velocity * targetDays), item.minimumStock * 2);
    const suggested = Math.max(0, target - item.quantity);
    if (suggested === 0) return [];

    return [{
      name: item.name,
      currentStock: item.quantity,
      dailyVelocity: round2(velocity),
      daysOfCover: cover !== null ? round2(cover) : null,
      reason: belowMin
        ? `Stock (${item.quantity}) is at or below the minimum (${item.minimumStock}).`
        : `At ${round2(velocity)}/day, current stock covers only ${round2(cover!)} days (target ${targetDays}).`,
      suggestedQuantity: suggested,
    }];
  }).sort((a, b) => (a.daysOfCover ?? Infinity) - (b.daysOfCover ?? Infinity));
}
