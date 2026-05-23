import { getFormIntent, isFormSubmissionInFlight } from "~/lib/form-navigation";
import { useNavigation } from "react-router";

export type FormSubmittingOptions = {
  /** Match hidden input `name="intent"`. */
  intent?: string;
  /** Match another hidden field, e.g. userId for per-row delete buttons. */
  matchField?: string;
  matchValue?: string;
};

export function useFormSubmitting(options: FormSubmittingOptions = {}): boolean {
  const navigation = useNavigation();
  if (!isFormSubmissionInFlight(navigation)) {
    return false;
  }

  if (options.intent != null && getFormIntent(navigation) !== options.intent) {
    return false;
  }

  if (options.matchField != null) {
    return navigation.formData!.get(options.matchField) === options.matchValue;
  }

  return true;
}
