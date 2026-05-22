/**
 * Build Fly.io secrets from .env and apply with `fly secrets import`.
 *
 * Excludes local-only vars (DATABASE_URL, SEED_*). Rewrites localhost APP_URL
 * to https://<app>.fly.dev unless FLY_APP_URL is set.
 *
 * Usage:
 *   node scripts/fly-secrets-from-env.mjs              # dry-run (default)
 *   node scripts/fly-secrets-from-env.mjs --apply
 *   node scripts/fly-secrets-from-env.mjs --apply --app lotus-ledger
 *
 * Env file: FLY_SECRETS_ENV_PATH (default: .env in project root)
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const appFlagIndex = args.indexOf("--app");
const app =
  (appFlagIndex >= 0 ? args[appFlagIndex + 1] : null) ||
  process.env.FLY_APP ||
  "lotus-ledger";

const envPath =
  process.env.FLY_SECRETS_ENV_PATH?.trim() ||
  resolve(projectRoot, ".env");

/** Never push these — Fly Postgres sets DATABASE_URL; seeds are local-only. */
const EXCLUDE_KEYS = new Set([
  "DATABASE_URL",
  "SEED_USER_EMAIL",
  "SEED_USER_PASSWORD",
  "SEED_USER_NAME",
]);

/** Keys we may send when present in .env */
const ALLOWED_KEYS = new Set([
  "STRIPE_SECRET_KEY",
  "QUICKBOOKS_CLIENT_ID",
  "QUICKBOOKS_CLIENT_SECRET",
  "QUICKBOOKS_ENVIRONMENT",
  "APP_URL",
  "SESSION_SECRET",
  "ENCRYPTION_KEY",
  "RESEND_API_KEY",
  "RESEND_FROM",
  "RESEND_FROM_EMAIL",
  "resend_api_key",
]);

function normalizeAppUrl(raw, appName) {
  let url = raw.trim().replace(/\/$/, "");
  url = url.replace(/\/integrations\/quickbooks\/callback$/i, "");
  return url;
}

function isLocalUrl(url) {
  return /localhost|127\.0\.0\.1/i.test(url);
}

function quoteDotenvValue(value) {
  if (/^[A-Za-z0-9_./:@+-]+$/.test(value)) {
    return value;
  }
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function buildSecrets(parsed) {
  const secrets = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (EXCLUDE_KEYS.has(key)) continue;
    if (!ALLOWED_KEYS.has(key)) continue;
    const trimmed = String(value ?? "").trim();
    if (!trimmed) continue;
    secrets[key] = trimmed;
  }

  if (secrets.resend_api_key && !secrets.RESEND_API_KEY) {
    secrets.RESEND_API_KEY = secrets.resend_api_key;
  }
  delete secrets.resend_api_key;

  if (!secrets.RESEND_FROM && secrets.RESEND_FROM_EMAIL) {
    secrets.RESEND_FROM = secrets.RESEND_FROM_EMAIL;
  }
  delete secrets.RESEND_FROM_EMAIL;

  let appUrl = secrets.APP_URL;
  if (!appUrl || isLocalUrl(appUrl)) {
    const override = process.env.FLY_APP_URL?.trim();
    appUrl = override || `https://${app}.fly.dev`;
    console.warn(
      `APP_URL in .env is missing or local — using ${appUrl} for Fly (override with FLY_APP_URL).`,
    );
  }
  secrets.APP_URL = normalizeAppUrl(appUrl, app);

  return secrets;
}

function toDotenvBody(secrets) {
  return Object.entries(secrets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${quoteDotenvValue(value)}`)
    .join("\n");
}

function mask(value) {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

if (!existsSync(envPath)) {
  console.error(`Env file not found: ${envPath}`);
  process.exit(1);
}

const parsed = parse(readFileSync(envPath, "utf8"));
const secrets = buildSecrets(parsed);
const keys = Object.keys(secrets);

if (keys.length === 0) {
  console.error("No secrets to import. Check .env has values for allowed keys.");
  process.exit(1);
}

console.log(`Source: ${envPath}`);
console.log(`Fly app: ${app}`);
console.log(`Secrets (${keys.length}):`);
for (const key of keys) {
  console.log(`  ${key}=${mask(secrets[key])}`);
}

const body = toDotenvBody(secrets);

if (!apply) {
  console.log("\nDry run only. To apply on Fly:");
  console.log(`  npm run fly:secrets:set`);
  console.log(`  node scripts/fly-secrets-from-env.mjs --apply --app ${app}`);
  process.exit(0);
}

console.log("\nRunning: fly secrets import ...");
const result = spawnSync("fly", ["secrets", "import", "--app", app], {
  input: body,
  encoding: "utf8",
  stdio: ["pipe", "inherit", "inherit"],
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(result.error.message);
  console.error("Is the Fly CLI installed? https://fly.io/docs/hands-on/install-flyctl/");
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("Fly secrets updated. Deploy if the app is already running:");
console.log(`  fly deploy --app ${app}`);
