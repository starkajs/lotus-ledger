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

let cachedRegionCodes: string[] | null = null;

function getSearchableRegionCodes(): string[] {
  if (cachedRegionCodes) return cachedRegionCodes;

  if (typeof Intl.supportedValuesOf === "function") {
    try {
      const codes = (Intl.supportedValuesOf as (key: string) => string[])(
        "region",
      ).filter((code) => /^[A-Z]{2}$/.test(code));
      if (codes.length > 0) {
        cachedRegionCodes = codes;
        return codes;
      }
    } catch {
      // fall through to brute-force valid codes
    }
  }

  const codes: string[] = [];
  for (let i = 65; i <= 90; i++) {
    for (let j = 65; j <= 90; j++) {
      const code = String.fromCharCode(i) + String.fromCharCode(j);
      try {
        if (displayNames.of(code)) codes.push(code);
      } catch {
        // not a valid region code
      }
    }
  }
  cachedRegionCodes = codes;
  return codes;
}

/** Country codes whose ISO code or English name partially matches the query. */
export function countryCodesMatchingSearch(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const matches: string[] = [];
  for (const code of getSearchableRegionCodes()) {
    const name = (displayNames.of(code) ?? "").toLowerCase();
    if (code.toLowerCase().includes(q) || name.includes(q)) {
      matches.push(code);
    }
  }
  return matches;
}
