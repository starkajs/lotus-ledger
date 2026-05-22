import { Resend } from "resend";
import {
  getResendApiKey as getResendApiKeyFromEnv,
  isResendConfigured as isResendConfiguredFromEnv,
  requireResendFromAddress,
} from "./env.server";
import {
  buildEmailChangeEmailContent,
  type EmailChangeEmailParams,
} from "./email-change-email.server";
import { buildInviteEmailContent, type InviteEmailParams } from "./invite-email.server";

let client: Resend | null = null;

export function getResendApiKey(): string | undefined {
  return getResendApiKeyFromEnv();
}

export function getResendFromAddress(): string {
  return requireResendFromAddress();
}

export function isResendConfigured(): boolean {
  return isResendConfiguredFromEnv();
}

function getResendClient(): Resend {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set");
  }
  if (!client) {
    client = new Resend(apiKey);
  }
  return client;
}

export async function sendUserInviteEmail(
  params: InviteEmailParams,
): Promise<{ id: string }> {
  const resend = getResendClient();
  const { subject, html, text } = buildInviteEmailContent(params);

  const { data, error } = await resend.emails.send({
    from: getResendFromAddress(),
    to: params.to,
    subject,
    html,
    text,
  });

  if (error) {
    throw new Error(error.message);
  }
  if (!data?.id) {
    throw new Error("Resend did not return an email id");
  }

  return { id: data.id };
}

export async function sendEmailChangeEmail(
  params: EmailChangeEmailParams,
): Promise<{ id: string }> {
  const resend = getResendClient();
  const { subject, html, text } = buildEmailChangeEmailContent(params);

  const { data, error } = await resend.emails.send({
    from: getResendFromAddress(),
    to: params.to,
    subject,
    html,
    text,
  });

  if (error) {
    throw new Error(error.message);
  }
  if (!data?.id) {
    throw new Error("Resend did not return an email id");
  }

  return { id: data.id };
}
