import type { ReactNode } from "react";

type MaxWidth = "lg" | "5xl" | "full";

const maxWidthClass: Record<MaxWidth, string> = {
  lg: "max-w-lg",
  "5xl": "max-w-5xl",
  full: "max-w-none",
};

export type AppPageHeaderProps = {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  maxWidth?: MaxWidth;
};

export function AppPageHeader({
  title,
  description,
  actions,
  maxWidth = "5xl",
}: AppPageHeaderProps) {
  const containerClass = maxWidthClass[maxWidth];

  return (
    <header className="shrink-0 border-b border-sand-dark/40 bg-surface-overlay">
      <div className="px-6 py-5 sm:px-8">
        <div
          className={`mx-auto flex w-full flex-wrap items-start justify-between gap-4 ${containerClass}`}
        >
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl">{title}</h1>
            {description ? (
              <div className="mt-2 text-sm text-ink-muted sm:text-base">
                {description}
              </div>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
