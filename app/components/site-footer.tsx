import { Link } from "react-router";

type SiteFooterProps = {
  onManageCookies?: () => void;
};

export function SiteFooter({ onManageCookies }: SiteFooterProps) {
  return (
    <footer className="border-t border-sand-dark/40 py-8">
      <div className="mx-auto max-w-6xl space-y-3 px-4 text-center text-sm text-ink-faint sm:px-6">
        <p>Lotus Ledger — analytics for Jamyang London Buddhist Centre</p>
        <p>
          Built by{" "}
          <a
            href="https://aptim-solutions.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal underline-offset-2 hover:underline"
          >
            aptim-solutions.com
          </a>
        </p>
        <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <Link
            to="/cookie-policy"
            className="text-teal underline-offset-2 hover:underline"
          >
            Cookie policy
          </Link>
          {onManageCookies && (
            <>
              <span aria-hidden className="text-ink-faint">
                ·
              </span>
              <button
                type="button"
                onClick={onManageCookies}
                className="text-teal underline-offset-2 hover:underline"
              >
                Cookie preferences
              </button>
            </>
          )}
        </p>
      </div>
    </footer>
  );
}
