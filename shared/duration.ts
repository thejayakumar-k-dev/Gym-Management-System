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
 * Calendar date (`YYYY-MM-DD`) for a stored date value.
 *
 * Date strings coming out of Postgres (`date` columns) are used as-is so the
 * stored calendar date is never shifted by the viewer's timezone; Date objects
 * fall back to their *local* date parts.
 */
export function toDateOnly(value: string | Date): string {
  if (typeof value !== "string") {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Date-only strings (`YYYY-MM-DD`) come straight from Postgres `date`
  // columns — keep them byte-for-byte so the timezone never shifts the day.
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? "" : toDateOnly(parsed);
}

/**
 * Whole calendar days between two stored date values.
 *
 * Both sides are normalised through {@link toDateOnly} first, so Postgres
 * `date` strings and `Date` objects are treated identically. The maths runs in
 * UTC because a "day" is a calendar concept here — using local midnight would
 * make DST transitions report 23-hour days and round down to 0.
 *
 * Returns 0 for unparseable input, and never a negative number.
 */
export function daysBetweenDateOnly(from: string | Date, to: string | Date): number {
  const start = toDateOnly(from);
  const end = toDateOnly(to);
  if (!start || !end) return 0;

  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return 0;

  return Math.max(0, Math.round((endMs - startMs) / 86_400_000));
}

/**
 * `YYYY-MM` calendar month for a stored date value.
 *
 * Month bucketing used to go through `new Date(p.date).getMonth()`, which is
 * wrong: Postgres `date` columns arrive as `YYYY-MM-DD`, `new Date()` parses
 * that as UTC midnight, and reading `.getMonth()` back in local time lands on
 * the *previous* day for anyone west of UTC — so the 1st of the month was
 * billed to the month before. Comparing the `YYYY-MM` prefix as text sidesteps
 * timezones entirely.
 */
export function toMonthKey(value: string | Date): string {
  return toDateOnly(value).slice(0, 7);
}

/**
 * `YYYY-MM` key for a month index (0-11) within a given year.
 */
export function monthKeyFor(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

/**
 * Single source of truth for "is this membership expired?" — used by the
 * dashboard list, the dashboard stats and the attendance pad so they can never
 * disagree with each other again.
 *
 * - No expiry date → never renewed → expired (the attendance endpoint and the
 *   dashboard stats have always treated it this way).
 * - Otherwise the member is expired on/after the expiry date, which is the
 *   same rule the attendance pad uses (`daysLeft <= 0`).
 */
export function isMembershipExpired(
  expiryDate: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!expiryDate) return true;
  const expiry = toDateOnly(expiryDate);
  if (!expiry) return true;
  return expiry <= toDateOnly(now);
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