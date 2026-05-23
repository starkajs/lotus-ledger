import { getFormIntent, isFormSubmissionInFlight } from "~/lib/form-navigation";
import { useNavigation } from "react-router";

/** Form intents that may take many seconds — show full-screen busy overlay. */
const LONG_RUNNING_INTENTS = new Set([
  "sync",
  "classify",
  "reclassify",
  "refresh",
  "push",
  "push-qb-bulk",
  "clear-qb-push",
]);

const INTENT_MESSAGES: Record<string, string> = {
  classify: "Classifying transactions…",
  reclassify: "Re-classifying transaction…",
  refresh: "Refreshing from QuickBooks…",
  push: "Pushing to QuickBooks…",
  "clear-qb-push": "Clearing QuickBooks push flag…",
};

function messageForIntent(intent: string, pathname: string): string {
  if (intent === "push" || intent === "push-qb-bulk") {
    if (intent === "push-qb-bulk") {
      return INTENT_MESSAGES["push-qb-bulk"] ?? "Pushing to QuickBooks…";
    }
    if (pathname.includes("/integrations/stripe/transactions/quickbooks-push")) {
      return "Creating receipt in QuickBooks…";
    }
    return INTENT_MESSAGES.push ?? "Pushing to QuickBooks…";
  }
  if (intent === "sync") {
    if (pathname.includes("/integrations/woocommerce/products")) {
      return "Syncing WooCommerce products…";
    }
    if (pathname.includes("/integrations/woocommerce")) {
      return "Syncing WooCommerce orders…";
    }
    if (pathname.includes("/community")) {
      return "Syncing community from Stripe…";
    }
    if (pathname.includes("/integrations/stripe")) {
      return "Syncing from Stripe…";
    }
    return "Syncing…";
  }
  return INTENT_MESSAGES[intent] ?? "Working…";
}

export function useLongRunningSubmission(): {
  active: boolean;
  message: string;
} {
  const navigation = useNavigation();

  if (!isFormSubmissionInFlight(navigation)) {
    return { active: false, message: "" };
  }

  const intent = getFormIntent(navigation);
  if (!intent || !LONG_RUNNING_INTENTS.has(intent)) {
    return { active: false, message: "" };
  }

  const pathname = navigation.location?.pathname ?? "";
  return {
    active: true,
    message: messageForIntent(intent, pathname),
  };
}
