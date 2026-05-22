import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router";

/**
 * Scrollable main area for the authenticated shell. Resets scroll position when
 * the route pathname changes (window scroll is not used in that layout).
 */
export function ScrollMainOnNavigate({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    ref.current?.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return (
    <div ref={ref} className="min-h-0 flex-1 overflow-y-auto">
      {children}
    </div>
  );
}
