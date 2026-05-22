const ZERO_DECIMAL = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf",
  "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

export function minorUnitsToMajor(minorUnits: number, currency: string): number {
  if (ZERO_DECIMAL.has(currency.toLowerCase())) {
    return minorUnits;
  }
  return minorUnits / 100;
}

export function formatMoneyMajor(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

export function formatMoneyMinor(minorUnits: number, currency: string): string {
  return formatMoneyMajor(minorUnitsToMajor(minorUnits, currency), currency);
}
