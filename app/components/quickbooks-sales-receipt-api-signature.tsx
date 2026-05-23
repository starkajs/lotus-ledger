import type { ReactNode } from "react";
import {
  QUICKBOOKS_SALES_RECEIPT_CREATE_API,
  QUICKBOOKS_SALES_RECEIPT_CREATE_EXAMPLE,
} from "~/lib/quickbooks-sales-receipt-api";

export function QuickBooksSalesReceiptApiSignature({
  footer,
}: {
  footer?: ReactNode;
}) {
  const api = QUICKBOOKS_SALES_RECEIPT_CREATE_API;

  return (
    <section className="rounded-jamyang-lg border border-sand-dark/50 bg-surface-overlay p-4 sm:p-6">
      <h2 className="text-sm font-medium text-dark">Sales Receipt API (create)</h2>
      <p className="mt-1 text-xs text-ink-muted">
        Stripe balance transactions are pushed as QuickBooks{" "}
        <code className="font-mono text-dark">SalesReceipt</code> entities.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[28rem] text-left text-xs">
          <tbody className="divide-y divide-sand-dark/30">
            <tr>
              <th className="py-2 pr-4 font-medium text-ink-muted align-top w-28">
                Method
              </th>
              <td className="py-2 font-mono text-dark">{api.method}</td>
            </tr>
            <tr>
              <th className="py-2 pr-4 font-medium text-ink-muted align-top">
                URL
              </th>
              <td className="py-2 font-mono text-[11px] text-dark break-all">
                {"{baseUrl}"}
                {api.pathTemplate}
              </td>
            </tr>
            <tr>
              <th className="py-2 pr-4 font-medium text-ink-muted align-top">
                baseUrl
              </th>
              <td className="py-2 text-ink-muted leading-relaxed">
                Production:{" "}
                <code className="font-mono text-[11px] text-dark">
                  {api.productionBaseUrl}
                </code>
                <br />
                Sandbox:{" "}
                <code className="font-mono text-[11px] text-dark">
                  {api.sandboxBaseUrl}
                </code>
              </td>
            </tr>
            <tr>
              <th className="py-2 pr-4 font-medium text-ink-muted align-top">
                Auth
              </th>
              <td className="py-2 font-mono text-[11px] text-dark">{api.auth}</td>
            </tr>
            <tr>
              <th className="py-2 pr-4 font-medium text-ink-muted align-top">
                Content-Type
              </th>
              <td className="py-2 font-mono text-[11px] text-dark">
                {api.contentType}
              </td>
            </tr>
            <tr>
              <th className="py-2 pr-4 font-medium text-ink-muted align-top">
                Request body
              </th>
              <td className="py-2 text-ink-muted">{api.requestBody}</td>
            </tr>
            <tr>
              <th className="py-2 pr-4 font-medium text-ink-muted align-top">
                Response
              </th>
              <td className="py-2 font-mono text-[11px] text-dark">{api.response}</td>
            </tr>
            <tr>
              <th className="py-2 pr-4 font-medium text-ink-muted align-top">
                Code
              </th>
              <td className="py-2 font-mono text-[11px] text-dark">
                {api.implementedIn}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs font-medium text-ink-muted">Minimal example</p>
      <pre className="mt-2 overflow-x-auto rounded-jamyang border border-sand-dark/40 bg-surface p-3 text-[11px] font-mono text-dark">
        {JSON.stringify(QUICKBOOKS_SALES_RECEIPT_CREATE_EXAMPLE, null, 2)}
      </pre>

      {footer ? <div className="mt-3 text-xs text-ink-muted">{footer}</div> : null}
    </section>
  );
}
