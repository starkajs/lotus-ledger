import { useEffect } from "react";

type ActionToastProps = {
  message: string | null;
  onDismiss: () => void;
  durationMs?: number;
};

export function ActionToast({
  message,
  onDismiss,
  durationMs = 3500,
}: ActionToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss, durationMs]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 right-6 z-50 max-w-sm rounded-jamyang border border-jade/40 bg-surface-overlay px-4 py-3 text-sm text-dark shadow-lg"
    >
      <span className="font-medium text-jade">✓</span>{" "}
      <span>{message}</span>
    </div>
  );
}
