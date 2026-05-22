import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CookieBanner } from "./cookie-banner";

type CookieConsentContextValue = {
  openPreferences: () => void;
};

const CookieConsentContext = createContext<CookieConsentContextValue | null>(
  null,
);

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [showBanner, setShowBanner] = useState(false);

  const openPreferences = useCallback(() => {
    setShowBanner(true);
  }, []);

  const closePreferences = useCallback(() => {
    setShowBanner(false);
  }, []);

  const value = useMemo(() => ({ openPreferences }), [openPreferences]);

  return (
    <CookieConsentContext.Provider value={value}>
      {children}
      <CookieBanner forceShow={showBanner} onClose={closePreferences} />
    </CookieConsentContext.Provider>
  );
}

export function useCookieConsent() {
  const ctx = useContext(CookieConsentContext);
  if (!ctx) {
    throw new Error("useCookieConsent must be used within CookieConsentProvider");
  }
  return ctx;
}
