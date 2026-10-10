export const LOGIN_EVENT_TYPES = [
  "login_success",
  "login_failed",
  "logout",
] as const;

export type LoginEventType = (typeof LOGIN_EVENT_TYPES)[number];

export const LOGIN_EVENT_LABELS: Record<LoginEventType, string> = {
  login_success: "Signed in",
  login_failed: "Failed",
  logout: "Signed out",
};

export function isLoginEventType(value: string): value is LoginEventType {
  return (LOGIN_EVENT_TYPES as readonly string[]).includes(value);
}

export function loginEventLabel(eventType: string): string {
  return isLoginEventType(eventType) ? LOGIN_EVENT_LABELS[eventType] : eventType;
}
