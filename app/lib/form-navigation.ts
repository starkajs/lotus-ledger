/** Subset of React Router navigation used for form busy state. */
export type FormNavigationSnapshot = {
  state: "idle" | "loading" | "submitting";
  formData?: FormData;
  formMethod?: string;
  location?: { pathname: string };
};

/** True while a <Form> POST (etc.) is in flight, including loader revalidation after the action. */
export function isFormSubmissionInFlight(
  navigation: FormNavigationSnapshot
): boolean {
  if (!navigation.formData) return false;

  if (navigation.state === "submitting") return true;

  if (navigation.state === "loading") {
    const method = navigation.formMethod?.toUpperCase();
    return (
      method === "POST" ||
      method === "PUT" ||
      method === "PATCH" ||
      method === "DELETE"
    );
  }

  return false;
}

export function getFormIntent(navigation: FormNavigationSnapshot): string | null {
  if (!navigation.formData) return null;
  const intent = navigation.formData.get("intent");
  return typeof intent === "string" && intent.length > 0 ? intent : null;
}
