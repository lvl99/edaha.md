/** Pad a number to two digits */
const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Convert an ISO 8601 date to a `datetime-local` input value in local time.
 *
 * @example
 * toLocalInput("2026-10-19T09:54:00.000Z"); // "2026-10-19T11:54" in Paris (UTC+2)
 */
export const toLocalInput = (iso: string): string => {
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/**
 * Convert a `datetime-local` input value (local time) to an ISO 8601 date. Returns "" for an empty or invalid value.
 *
 * @example
 * fromLocalInput("2026-10-19T11:54"); // "2026-10-19T09:54:00.000Z" in Paris (UTC+2)
 */
export const fromLocalInput = (value: string): string => {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date.toISOString() : "";
};
