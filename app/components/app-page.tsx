import { useEffect, type ReactNode } from "react";
import type { AppPageHeaderProps } from "~/components/app-page-header";
import { useAppShell } from "~/hooks/use-app-shell";

export type AppPageProps = AppPageHeaderProps & {
  children?: ReactNode;
  contentClassName?: string;
};

const maxWidthClass = {
  lg: "max-w-lg",
  "5xl": "max-w-5xl",
  full: "max-w-none",
} as const;

export function AppPage({
  title,
  description,
  actions,
  maxWidth = "5xl",
  children,
  contentClassName = "",
}: AppPageProps) {
  const { setPageHeader } = useAppShell();

  useEffect(() => {
    setPageHeader({ title, description, actions, maxWidth });
    return () => setPageHeader(null);
  }, [title, description, actions, maxWidth, setPageHeader]);

  const containerClass = maxWidthClass[maxWidth];

  return (
    <div
      className={`mx-auto w-full px-6 py-8 sm:px-8 ${containerClass} ${contentClassName}`.trim()}
    >
      {children}
    </div>
  );
}
