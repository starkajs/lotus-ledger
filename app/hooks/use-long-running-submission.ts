import { useNavigation } from "react-router";

/** Form intents that may take many seconds — show full-screen busy overlay. */
const LONG_RUNNING_INTENTS = new Set([
  "sync",
  "classify",
  "reclassify",
  "refresh",
]);

const INTENT_MESSAGES: Record<string, string> = {
  classify: "Classifying transactions…",
  reclassify: "Re-classifying transaction…",
  refresh: "Refreshing from QuickBooks…",
};

function messageForIntent(intent: string, pathname: string): string {
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

  if (navigation.state !== "submitting" || !navigation.formData) {
    return { active: false, message: "" };
  }

  const intent = navigation.formData.get("intent");
  if (typeof intent !== "string" || !LONG_RUNNING_INTENTS.has(intent)) {
    return { active: false, message: "" };
  }

  const pathname = navigation.location?.pathname ?? "";
  return {
    active: true,
    message: messageForIntent(intent, pathname),
  };
}
