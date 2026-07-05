import {
  getCronReportRecipients,
} from "../../app/lib/sync-integrations-cron-email.server";
import type { IntegrationsCronReportEmailParams } from "../../app/lib/sync-integrations-cron-email.server";
import {
  isResendConfigured,
  sendIntegrationsCronReportEmail,
} from "../../app/lib/resend.server";

export async function notifyIntegrationsCronReport(
  params: IntegrationsCronReportEmailParams,
): Promise<{ sent: boolean; resendMessageId?: string; reason?: string }> {
  if (!isResendConfigured()) {
    return {
      sent: false,
      reason: "Resend is not configured (RESEND_API_KEY and RESEND_FROM)",
    };
  }

  const to = getCronReportRecipients();
  const { id } = await sendIntegrationsCronReportEmail({ ...params, to });
  return { sent: true, resendMessageId: id };
}
