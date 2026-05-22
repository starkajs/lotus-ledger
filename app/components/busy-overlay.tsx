import { useEffect } from "react";
import { Spinner } from "~/components/spinner";

type BusyOverlayProps = {
  message: string;
};

/**
 * Blocks the UI during long server actions (sync, classify, etc.).
 * Rendered at layout level while React Router navigation.state === "submitting".
 */
export function BusyOverlay({ message }: BusyOverlayProps) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-dark/45 backdrop-blur-[3px]"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-live="polite"
      aria-label={message}
    >
      <div className="pointer-events-auto mx-4 flex w-full max-w-sm flex-col items-center gap-5 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay px-8 py-9 shadow-xl">
        <div className="relative flex size-[4.5rem] items-center justify-center" aria-hidden>
          <span className="absolute inset-0 animate-ping rounded-full bg-maroon/25 [animation-duration:1.75s]" />
          <span className="absolute inset-3 animate-pulse rounded-full bg-sand/80" />
          <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-maroon border-r-maroon/40 [animation-duration:1.1s]" />
          <Spinner className="relative size-9 text-maroon" />
        </div>
        <div className="space-y-1.5 text-center">
          <p className="text-sm font-medium text-dark">{message}</p>
          <p className="text-xs text-ink-muted">
            Please wait — do not navigate away until this finishes.
          </p>
        </div>
        <div className="flex gap-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="size-1.5 rounded-full bg-maroon/70 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
