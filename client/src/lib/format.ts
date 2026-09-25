/**
 * Date display helpers — the whole app shows dates day-first.
 *
 * - formatDate      → 23/09/2026   (tables, lists)
 * - formatDateLong  → 23 September 2026
 * - formatDateFull  → Friday, 23 September 2026
 *
 * Postgres `date` columns arrive as "YYYY-MM-DD" strings; those are read
 * straight from the string so the calendar day can never shift with the
 * viewer's timezone. Anything else (timestamps, Date objects) falls back to
 * the local date parts.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const pad = (n: number) => String(n).padStart(2, "0");

function toParts(value: string | number | Date | null | undefined): {
  year: number;
  month: number;
  day: number;
} | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "string") {
    const dateOnly = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateOnly) {
      return {
        year: Number(dateOnly[1]),
        month: Number(dateOnly[2]),
        day: Number(dateOnly[3]),
      };
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

/** 23/09/2026 — returns "-" for missing/invalid dates. */
export function formatDate(
  value: string | number | Date | null | undefined
): string {
  const parts = toParts(value);
  if (!parts) return "-";
  return `${pad(parts.day)}/${pad(parts.month)}/${parts.year}`;
}

/** 23 September 2026 — returns "-" for missing/invalid dates. */
export function formatDateLong(
  value: string | number | Date | null | undefined
): string {
  const parts = toParts(value);
  if (!parts) return "-";
  return `${parts.day} ${MONTHS[parts.month - 1]} ${parts.year}`;
}

/** Friday, 23 September 2026 — returns "-" for missing/invalid dates. */
export function formatDateFull(
  value: string | number | Date | null | undefined
): string {
  const parts = toParts(value);
  if (!parts) return "-";
  const weekday = new Date(parts.year, parts.month - 1, parts.day).getDay();
  return `${WEEKDAYS[weekday]}, ${parts.day} ${MONTHS[parts.month - 1]} ${parts.year}`;
}
