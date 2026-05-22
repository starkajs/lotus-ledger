/** ISO 3166-1 alpha-2 from Stripe address.country (uppercase). */
export function normalizeCountryCode(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

const displayNames = new Intl.DisplayNames(["en"], { type: "region" });

export function formatCountryName(code: string | null | undefined): string | null {
  if (!code) return null;
  try {
    return displayNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
