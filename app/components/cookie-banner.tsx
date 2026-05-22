import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { getStoredConsent, storeConsent, type CookieConsent } from "../lib/cookies";

type CookieBannerProps = {
  forceShow?: boolean;
  onClose?: () => void;
};

export function CookieBanner({ forceShow = false, onClose }: CookieBannerProps) {
  const [mounted, setMounted] = useState(false);
  const [consent, setConsent] = useState<CookieConsent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const refresh = useCallback(() => {
    setConsent(getStoredConsent());
  }, []);

  useEffect(() => {
    setMounted(true);
    refresh();

    const handleChange = () => refresh();
    window.addEventListener("cookie-consent-changed", handleChange);
    return () => window.removeEventListener("cookie-consent-changed", handleChange);
  }, [refresh]);

  const visible =
    mounted && !dismissed && (forceShow || consent === null);

  const accept = (analytics: boolean) => {
    setConsent(storeConsent(analytics));
    setDismissed(false);
    onClose?.();
  };

  const handleManageClose = () => {
    if (forceShow) {
      setDismissed(true);
      onClose?.();
    }
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-banner-title"
      aria-describedby="cookie-banner-desc"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-sand-dark/50 bg-surface-overlay p-4 shadow-[0_-4px_24px_rgb(0_0_0_/0.08)] sm:p-6"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h2
            id="cookie-banner-title"
            className="text-base font-semibold text-dark"
          >
            We value your privacy
          </h2>
          <p id="cookie-banner-desc" className="mt-2 text-sm leading-relaxed text-ink-muted">
            We use essential cookies to remember your choices. With your
            permission, we may also use analytics cookies to improve Lotus
            Ledger. You can accept all, reject non-essential cookies, or read
            our{" "}
            <Link
              to="/cookie-policy"
              className="text-teal underline-offset-2 hover:underline"
            >
              cookie policy
            </Link>
            .
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          <button
            type="button"
            onClick={() => accept(false)}
            className="rounded-jamyang-pill border border-sand-dark/60 bg-surface-overlay px-4 py-2 text-sm font-medium text-dark transition-colors hover:bg-surface"
          >
            Reject non-essential
          </button>
          <button
            type="button"
            onClick={() => accept(true)}
            className="rounded-jamyang-pill bg-maroon px-4 py-2 text-sm font-medium text-surface-overlay transition-colors hover:bg-maroon-dark"
          >
            Accept all
          </button>
          {forceShow && (
            <button
              type="button"
              onClick={handleManageClose}
              className="rounded-jamyang-pill px-4 py-2 text-sm text-ink-muted hover:text-dark"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

