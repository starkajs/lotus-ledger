import { useRef, type ReactNode } from "react";

function setDetailsOpen(root: HTMLElement | null, open: boolean) {
  root?.querySelectorAll("details").forEach((element) => {
    element.open = open;
  });
}

/** Collapsible group. The summary stays visible; the transaction list starts closed. */
export function ReconciliationDetailGroup({
  summary,
  children,
}: {
  summary: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="overflow-hidden rounded-jamyang border border-sand-dark/40">
      <summary className="cursor-pointer marker:text-ink-muted">{summary}</summary>
      <div className="border-t border-sand-dark/40">{children}</div>
    </details>
  );
}

export function ReconciliationDetailList({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={rootRef} className="space-y-4">
      <div className="flex justify-end gap-3 text-xs">
        <button
          type="button"
          className="text-teal hover:underline"
          onClick={() => setDetailsOpen(rootRef.current, true)}
        >
          Expand all
        </button>
        <button
          type="button"
          className="text-teal hover:underline"
          onClick={() => setDetailsOpen(rootRef.current, false)}
        >
          Collapse all
        </button>
      </div>
      {children}
    </div>
  );
}
