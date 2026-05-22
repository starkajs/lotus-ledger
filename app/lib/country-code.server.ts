import { formatCountryName } from "~/lib/country-code";

const displayNames = new Intl.DisplayNames(["en"], { type: "region" });

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
    const name = (formatCountryName(code) ?? "").toLowerCase();
    if (code.toLowerCase().includes(q) || name.includes(q)) {
      matches.push(code);
    }
  }
  return matches;
}
