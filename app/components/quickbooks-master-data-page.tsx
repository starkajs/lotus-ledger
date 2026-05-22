import { Form, Link } from "react-router";
import type { ReactNode } from "react";
import { AppPage } from "~/components/app-page";
import { SubmitButton } from "~/components/submit-button";
import type { QuickBooksMasterDataSyncResult } from "~/lib/quickbooks-master-data.server";

export function formatSyncedAt(iso: string | null): string {
  if (!iso) return "Never";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? "rounded-jamyang bg-jade/10 px-2 py-0.5 text-xs text-dark"
          : "rounded-jamyang bg-sand/80 px-2 py-0.5 text-xs text-ink-muted"
      }
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export function QuickBooksNotConnected() {
  return (
    <div
      role="alert"
      className="rounded-jamyang-lg border border-maroon/30 bg-maroon/5 p-6 text-sm"
    >
      <p className="font-medium text-maroon">QuickBooks not connected</p>
      <p className="mt-2 text-ink-muted">
        Connect QuickBooks before refreshing master data.
      </p>
      <Link
        to="/integrations/quickbooks"
        className="mt-4 inline-block rounded-jamyang-pill bg-maroon px-4 py-2 text-sm font-medium text-surface-overlay hover:bg-maroon-dark"
      >
        Go to QuickBooks
      </Link>
    </div>
  );
}

type QuickBooksMasterDataPageProps = {
  title: string;
  description: ReactNode;
  connected: boolean;
  companyName: string | null;
  lastSyncedAt: string | null;
  postAction: string;
  syncResult:
    | (QuickBooksMasterDataSyncResult & {
        daysLimit?: number;
        sinceDate?: string;
        tombstoned?: number;
      })
    | null;
  syncError: string | null;
  count: number;
  countLabel: string;
  children: ReactNode;
};

export function QuickBooksMasterDataPage({
  title,
  description,
  connected,
  companyName,
  lastSyncedAt,
  postAction,
  syncResult,
  syncError,
  count,
  countLabel,
  children,
}: QuickBooksMasterDataPageProps) {
  return (
    <AppPage
      title={title}
      description={description}
      actions={
        <Link
          to="/integrations/quickbooks"
          className="rounded-jamyang-pill border border-sand-dark/60 px-4 py-2 text-sm hover:bg-surface"
        >
          QuickBooks
        </Link>
      }
    >
      {!connected ? (
        <QuickBooksNotConnected />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay px-4 py-3 text-sm">
            <div className="text-ink-muted">
              {companyName ? (
                <span>
                  Company: <strong className="text-dark">{companyName}</strong>
                  {" · "}
                </span>
              ) : null}
              <span>
                {count} {countLabel}
                {" · "}
                Last refreshed: {formatSyncedAt(lastSyncedAt)}
              </span>
            </div>
            <Form method="post" action={postAction}>
              <SubmitButton
                intent="refresh"
                variant="pill"
                loadingLabel="Refreshing from QuickBooks…"
              >
                Refresh from QuickBooks
              </SubmitButton>
            </Form>
          </div>

          {syncResult && (
            <p
              role="status"
              className="mb-4 rounded-jamyang border border-jade/40 bg-jade/5 px-4 py-3 text-sm text-dark"
            >
              Refreshed from QuickBooks: {syncResult.total} rows (
              {syncResult.created} new, {syncResult.updated} updated)
              {syncResult.daysLimit
                ? ` · last ${syncResult.daysLimit} days (from ${syncResult.sinceDate})`
                : ""}
              {syncResult.tombstoned && syncResult.tombstoned > 0
                ? ` · ${syncResult.tombstoned} marked removed in QuickBooks`
                : ""}
              .
            </p>
          )}

          {syncError && (
            <p
              role="alert"
              className="mb-4 rounded-jamyang border border-maroon/30 bg-maroon/5 px-4 py-3 text-sm text-maroon"
            >
              {syncError}
            </p>
          )}

          {children}
        </>
      )}
    </AppPage>
  );
}
