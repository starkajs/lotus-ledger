export type CookieConsent = {
  essential: true;
  analytics: boolean;
  timestamp: string;
};

const STORAGE_KEY = "lotus-ledger-cookie-consent";

export function getStoredConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CookieConsent;
    if (parsed.essential !== true || typeof parsed.analytics !== "boolean") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function storeConsent(analytics: boolean): CookieConsent {
  const consent: CookieConsent = {
    essential: true,
    analytics,
    timestamp: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
  window.dispatchEvent(new CustomEvent("cookie-consent-changed", { detail: consent }));
  return consent;
}

export function clearConsent(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("cookie-consent-changed", { detail: null }));
}

export function hasAnalyticsConsent(): boolean {
  return getStoredConsent()?.analytics === true;
}
