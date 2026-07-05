import type { SyncIntegrationsCronResult } from "./sync-integrations-cron.server";

export const DEFAULT_CRON_REPORT_RECIPIENTS = [
  "andrew@jamyang.co.uk",
  "andrew.stark@aptim-solutions.com",
] as const;

export function getCronReportRecipients(): string[] {
  const raw = process.env.CRON_REPORT_TO?.trim();
  if (raw) {
    return raw
      .split(/[,;]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [...DEFAULT_CRON_REPORT_RECIPIENTS];
}

export type IntegrationsCronReportEmailParams =
  | {
      ok: true;
      result: SyncIntegrationsCronResult;
      finishedAt?: Date;
    }
  | {
      ok: false;
      error: string;
      finishedAt?: Date;
    };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatFinishedAt(date: Date): string {
  return date.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  });
}

function row(label: string, value: string | number): string {
  return `<tr><td style="padding:0.35rem 1rem 0.35rem 0;color:#6b5d4f;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:0.35rem 0;"><strong>${escapeHtml(String(value))}</strong></td></tr>`;
}

function section(title: string, rows: string): string {
  return `<h2 style="margin:1.5rem 0 0.5rem;font-size:1rem;color:#2c2419;">${escapeHtml(title)}</h2><table style="border-collapse:collapse;">${rows}</table>`;
}

function listItems(items: Array<{ id: string; detail: string }>): string {
  if (items.length === 0) return "";
  const lis = items
    .map(
      (item) =>
        `<li style="margin:0.25rem 0;"><code style="font-size:0.85em;">${escapeHtml(item.id)}</code> — ${escapeHtml(item.detail)}</li>`,
    )
    .join("");
  return `<ul style="margin:0.5rem 0 0;padding-left:1.25rem;font-size:0.9rem;">${lis}</ul>`;
}

function successSummary(result: SyncIntegrationsCronResult): {
  headline: string;
  hasWarnings: boolean;
} {
  const hasWarnings = result.quickbooks.stripePush.failed > 0;
  return {
    headline: hasWarnings
      ? "Integration sync finished with QuickBooks push failures"
      : "Integration sync completed successfully",
    hasWarnings,
  };
}

export function buildIntegrationsCronReportEmailContent(
  params: IntegrationsCronReportEmailParams,
) {
  const finishedAt = params.finishedAt ?? new Date();
  const finishedLabel = formatFinishedAt(finishedAt);

  if (!params.ok) {
    const subject = "Lotus Ledger: integration sync failed";
    const text = `Integration sync failed at ${finishedLabel}

${params.error}

— Lotus Ledger (automated cron report)`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',system-ui,sans-serif;line-height:1.5;color:#2c2419;max-width:40rem;">
  <p style="color:#8b2942;font-weight:600;">Integration sync failed</p>
  <p style="font-size:0.875rem;color:#6b5d4f;">${escapeHtml(finishedLabel)} (Europe/London)</p>
  <pre style="margin:1rem 0;padding:0.75rem;background:#fdf2f4;border:1px solid #e8c4cc;border-radius:6px;white-space:pre-wrap;font-size:0.875rem;">${escapeHtml(params.error)}</pre>
  <p style="font-size:0.875rem;color:#6b5d4f;">Check Fly cron logs: <code>fly logs --app lotus-ledger --process cron</code></p>
  <p style="font-size:0.875rem;color:#6b5d4f;">— Lotus Ledger</p>
</body>
</html>`;

    return { subject, html, text };
  }

  const { result } = params;
  const { headline, hasWarnings } = successSummary(result);
  const subject = hasWarnings
    ? "Lotus Ledger: integration sync completed (with QB push failures)"
    : "Lotus Ledger: integration sync completed";

  const wooOrders = result.woocommerce.orders;
  const wooProducts = result.woocommerce.products;
  const stripe = result.stripe;
  const push = result.quickbooks.stripePush;
  const sales = result.quickbooks.salesReceipts;
  const refunds = result.quickbooks.refundReceipts;

  const textSections = [
    `${headline} at ${finishedLabel}`,
    "",
    "WooCommerce orders",
    `  Created: ${wooOrders.created}`,
    `  Updated: ${wooOrders.updated}`,
    `  Linked to member: ${wooOrders.membersLinked}`,
    wooOrders.daysLimit ? `  Days window: ${wooOrders.daysLimit}` : null,
    "",
    "WooCommerce products",
    `  Created: ${wooProducts.created}`,
    `  Updated: ${wooProducts.updated}`,
    "",
    "Stripe balance transactions",
    `  Connections: ${stripe.connectionsProcessed}`,
    `  Created: ${stripe.created}`,
    `  Updated: ${stripe.updated}`,
    `  Classified: ${stripe.classified}`,
    `  Skipped (manual): ${stripe.classificationSkippedManual}`,
    "",
    "Stripe → QuickBooks push",
    `  Eligible in window: ${push.matchedFilter}`,
    `  Pushed: ${push.pushed}`,
    `  Skipped: ${push.skipped}`,
    `  Failed: ${push.failed}`,
    ...push.skippedSample.map(
      (row) => `  Skipped example: ${row.stripeBalanceTransactionId} — ${row.reason}`,
    ),
    ...push.failedSample.map(
      (row) => `  Failed example: ${row.stripeBalanceTransactionId} — ${row.message}`,
    ),
    "",
    "QuickBooks sales receipts",
    `  Created: ${sales.created}, updated: ${sales.updated}, tombstoned: ${sales.tombstoned}`,
    "",
    "QuickBooks refund receipts",
    `  Created: ${refunds.created}, updated: ${refunds.updated}, tombstoned: ${refunds.tombstoned}`,
    "",
    "— Lotus Ledger (automated cron report)",
  ]
    .filter((line): line is string => line != null)
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',system-ui,sans-serif;line-height:1.5;color:#2c2419;max-width:40rem;">
  <p style="font-weight:600;color:${hasWarnings ? "#9a6700" : "#1a6b4a"};">${escapeHtml(headline)}</p>
  <p style="font-size:0.875rem;color:#6b5d4f;">${escapeHtml(finishedLabel)} (Europe/London)</p>
  ${section(
    "WooCommerce orders",
    [
      row("Created", wooOrders.created),
      row("Updated", wooOrders.updated),
      row("Linked to member", wooOrders.membersLinked),
      wooOrders.daysLimit ? row("Days window", wooOrders.daysLimit) : "",
    ].join(""),
  )}
  ${section(
    "WooCommerce products",
    [row("Created", wooProducts.created), row("Updated", wooProducts.updated)].join(""),
  )}
  ${section(
    "Stripe balance transactions",
    [
      row("Connections", stripe.connectionsProcessed),
      row("Created", stripe.created),
      row("Updated", stripe.updated),
      row("Classified", stripe.classified),
      row("Skipped (manual)", stripe.classificationSkippedManual),
    ].join(""),
  )}
  ${section(
    "Stripe → QuickBooks push",
    [
      row("Eligible in window", push.matchedFilter),
      row("Pushed", push.pushed),
      row("Skipped", push.skipped),
      row("Failed", push.failed),
    ].join(""),
  )}
  ${listItems(
    push.skippedSample.map((entry) => ({
      id: entry.stripeBalanceTransactionId,
      detail: entry.reason,
    })),
  )}
  ${listItems(
    push.failedSample.map((entry) => ({
      id: entry.stripeBalanceTransactionId,
      detail: entry.message,
    })),
  )}
  ${section(
    "QuickBooks sales receipts",
    [
      row("Created", sales.created),
      row("Updated", sales.updated),
      row("Tombstoned", sales.tombstoned),
    ].join(""),
  )}
  ${section(
    "QuickBooks refund receipts",
    [
      row("Created", refunds.created),
      row("Updated", refunds.updated),
      row("Tombstoned", refunds.tombstoned),
    ].join(""),
  )}
  <p style="margin-top:1.5rem;font-size:0.875rem;color:#6b5d4f;">— Lotus Ledger (automated cron report)</p>
</body>
</html>`;

  return { subject, html, text: textSections };
}
