/** Default window for `npm run sync:stripe-transactions` (CLI). */
export const STRIPE_SYNC_DAYS = 90;

/** Default window for Sync from Stripe in the app UI and integration cron. */
export const STRIPE_APP_SYNC_DAYS = 30;

/** Hard cap for automated sync windows (cron / app). */
export const STRIPE_SYNC_DAYS_MAX = 90;
