export const DURATION_PRESETS = [
  { label: "1 Month", value: 1 },
  { label: "3 Months", value: 3 },
  { label: "1 Year", value: 12 },
] as const;

export function addMonths(base: Date, months: number): Date {
  const date = new Date(base);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return date;
}

export function formatDuration(duration: number): string {
  return duration === 1 ? "1 month" : `${duration} months`;
}

/**
 * Work out the price for a membership of `months` months from the vendor's
 * configured plans (Membership Plans tab).
 *
 * - Exact plan match (1 / 3 / 12 months) wins.
 * - Otherwise falls back to a per-month rate derived from the shortest
 *   configured plan (e.g. 1 Month @ ₹500 → 6 months = ₹3000).
 * - Returns 0 when no plans are configured yet.
 */
export function calculatePlanPrice(
  plans: { durationMonths: number; price: number }[],
  months: number
): number {
  if (!months || months < 1) return 0;

  const configured = plans.filter((p) => p.price > 0 && p.durationMonths > 0);
  const exact = configured.find((p) => p.durationMonths === months);
  if (exact) return exact.price;

  const base = [...configured].sort(
    (a, b) => a.durationMonths - b.durationMonths
  )[0];
  if (!base) return 0;

  const monthlyRate = Math.round(base.price / base.durationMonths);
  return monthlyRate * months;
}