import {
  quickbooksPushStatus,
  type QuickbooksPushStatus,
} from "~/lib/stripe-quickbooks.constants";

export function QuickbooksPushBadge({
  pushed,
}: {
  pushed: boolean | null;
}) {
  const status = quickbooksPushStatus(pushed);
  return <QuickbooksPushBadgeForStatus status={status} />;
}

export function QuickbooksPushBadgeForStatus({
  status,
}: {
  status: QuickbooksPushStatus;
}) {
  if (status === "yes") {
    return (
      <span className="inline-flex rounded bg-jade/15 px-1.5 py-0.5 text-[10px] font-medium text-jade">
        Yes
      </span>
    );
  }
  if (status === "na") {
    return (
      <span className="inline-flex rounded bg-sand/60 px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
        NA
      </span>
    );
  }
  return (
    <span className="inline-flex rounded bg-sand/80 px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
      No
    </span>
  );
}
