/**
 * Shared utility functions — deduplicated from actions.ts, data.ts, auth-actions.ts.
 * Digunakan sebagai central utility untuk menghindari duplikasi.
 */

/**
 * Safely extract a string from FormData.
 */
export function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Safely extract a number from FormData.
 */
export function getNumber(formData: FormData, key: string): number {
  const raw = getString(formData, key).replace(/\./g, "").replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Normalize text for comparison (uppercase, remove non-alphanumeric).
 */
export function normalizeText(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Normalize text for search (lowercase, collapse whitespace).
 */
export function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Check if an error is a Firebase "not found" error.
 */
export function isFirebaseNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const withCode = error as { code?: unknown };
  if (
    withCode.code === 5 ||
    withCode.code === "not-found" ||
    withCode.code === "NOT_FOUND"
  ) {
    return true;
  }
  const withMessage = error as { message?: unknown };
  if (
    typeof withMessage.message === "string" &&
    withMessage.message.includes("NOT_FOUND")
  ) {
    return true;
  }
  return false;
}

/**
 * Format date to Jakarta timezone YYYY-MM-DD.
 */
export function formatDateJakarta(date: Date): string {
  return date
    .toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" })
    .slice(0, 10);
}

/**
 * Parse a Rupiah-formatted string to number.
 * Handles formats like "1.500.000" or "1500000".
 */
export function parseRupiahString(value: string): number {
  const cleaned = value.replace(/[^\d,-]/g, "").replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}
