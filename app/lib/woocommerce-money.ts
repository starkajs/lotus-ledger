import { minorUnitsToMajor } from "~/lib/money";

const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf",
  "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

/** Parse WooCommerce decimal string (e.g. "49.00") to minor units. */
export function parseWooCommerceMoneyMinor(
  value: string | number | null | undefined,
  currency: string,
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const major = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(major)) return null;
  if (ZERO_DECIMAL.has(currency.toLowerCase())) {
    return Math.round(major);
  }
  return Math.round(major * 100);
}

export function formatWooCommerceMoneyMinor(
  minor: number | null | undefined,
  currency: string,
): string {
  if (minor === null || minor === undefined) return "—";
  const major = minorUnitsToMajor(minor, currency);
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(major);
}
