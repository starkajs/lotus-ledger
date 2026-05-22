import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "~/components/spinner";
import {
  useFormSubmitting,
  type FormSubmittingOptions,
} from "~/hooks/use-form-submitting";

type Variant = "primary" | "pill" | "ghost" | "outline";

const variantClass: Record<Variant, string> = {
  primary:
    "w-full rounded-jamyang-pill bg-maroon px-5 py-2.5 text-sm font-medium text-surface-overlay transition-colors hover:bg-maroon-dark disabled:cursor-not-allowed disabled:opacity-70",
  pill: "rounded-jamyang-pill bg-maroon px-5 py-2 text-sm font-medium text-surface-overlay transition-colors hover:bg-maroon-dark disabled:cursor-not-allowed disabled:opacity-70",
  ghost:
    "inline-flex items-center gap-2 text-sm text-maroon hover:underline disabled:cursor-not-allowed disabled:opacity-60",
  outline:
    "rounded-jamyang-pill border border-sand-dark/60 px-5 py-2 text-sm font-medium text-dark transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-70",
};

export type SubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  FormSubmittingOptions & {
    children: ReactNode;
    loadingLabel?: string;
    variant?: Variant;
  };

export function SubmitButton({
  children,
  loadingLabel,
  intent,
  matchField,
  matchValue,
  variant = "primary",
  className = "",
  disabled,
  ...props
}: SubmitButtonProps) {
  const pending = useFormSubmitting({ intent, matchField, matchValue });

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      className={`inline-flex items-center justify-center gap-2 ${variantClass[variant]} ${className}`.trim()}
      {...props}
    >
      {pending ? (
        <>
          <Spinner
            className={variant === "ghost" ? "size-3.5" : "size-4"}
          />
          <span>{loadingLabel ?? children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
