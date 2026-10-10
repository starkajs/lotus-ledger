/**
 * Accept only a same-origin path. Rejects absolute URLs, protocol-relative
 * URLs, and backslash tricks that browsers treat as off-site redirects.
 */
export function safeRedirectPath(
  value: string | null | undefined,
  fallback = "/home",
): string {
  if (value == null) return fallback;
  const candidate = value.trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return fallback;
  if (/[\0\r\n\\]/.test(candidate)) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(candidate, "http://local.test");
  } catch {
    return fallback;
  }

  if (parsed.origin !== "http://local.test") return fallback;
  if (parsed.username || parsed.password) return fallback;
  if (!parsed.pathname.startsWith("/") || parsed.pathname.includes("\\")) {
    return fallback;
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
