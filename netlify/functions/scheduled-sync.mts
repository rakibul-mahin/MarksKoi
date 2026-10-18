/** Netlify scheduled-function config (typed inline to avoid a build-only dependency). */
type Config = { schedule: string };

/**
 * Netlify Scheduled Function: calls the app's protected cron endpoint every 15 minutes.
 * The endpoint processes a small batch of courses so each run stays well inside function limits.
 */
const scheduledSync = async () => {
  const base = process.env.URL ?? process.env.APP_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error(JSON.stringify({ level: "error", msg: "scheduled-sync: URL/APP_URL or CRON_SECRET missing" }));
    return;
  }
  const res = await fetch(`${base.replace(/\/+$/, "")}/api/cron/sync`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(28_000),
  });
  console.log(JSON.stringify({ level: "info", msg: "scheduled-sync", status: res.status, body: (await res.text()).slice(0, 500) }));
};

export default scheduledSync;

export const config: Config = { schedule: "*/15 * * * *" };
